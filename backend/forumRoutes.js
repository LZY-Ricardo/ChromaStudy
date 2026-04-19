const { Router } = require("express");
const { prisma } = require("./prismaClient");

const router = Router();

// ── Async handler wrapper ──

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

// ── Privacy helpers ──

const PRIVACY_PRESETS = {
  privacy: {
    totalHours: true,
    streakDays: true,
    weeklyHours: false,
    subjectDistribution: false,
    studyCalendar: false,
    aiReport: false,
  },
  social: {
    totalHours: true,
    streakDays: true,
    weeklyHours: true,
    subjectDistribution: true,
    studyCalendar: false,
    aiReport: false,
  },
  open: {
    totalHours: true,
    streakDays: true,
    weeklyHours: true,
    subjectDistribution: true,
    studyCalendar: true,
    aiReport: true,
  },
};

function parsePrivacySettings(raw) {
  try {
    const obj = typeof raw === "string" ? JSON.parse(raw) : raw || {};
    const preset = PRIVACY_PRESETS[obj.preset] || PRIVACY_PRESETS.privacy;
    const overrides = obj.overrides || {};
    return { ...preset, ...overrides };
  } catch {
    return { ...PRIVACY_PRESETS.privacy };
  }
}

function computeStreak(logs) {
  if (!logs.length) return 0;
  const dates = [...new Set(logs.map((l) => l.date))].sort().reverse();
  const today = new Date().toISOString().slice(0, 10);
  if (dates[0] !== today) return 0;
  let streak = 1;
  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i - 1]);
    const curr = new Date(dates[i]);
    const diff = (prev - curr) / (1000 * 60 * 60 * 24);
    if (diff === 1) streak++;
    else break;
  }
  return streak;
}

// ── Notification helper ──

async function sendForumNotification({ userId, type, relatedPostId, relatedCommentId, relatedGroupId, pushTitle, pushBody }) {
  const notif = await prisma.forumNotification.create({
    data: { type, userId, relatedPostId: relatedPostId ?? null, relatedCommentId: relatedCommentId ?? null, relatedGroupId: relatedGroupId ?? null },
  });

  try {
    const subs = await prisma.pushSubscription.findMany({ where: { userId } });
    if (!subs.length) return;
    const webpush = (await import("web-push")).default;
    const payload = JSON.stringify({ title: pushTitle, body: pushBody, type: "forum", notificationId: notif.id });
    for (const sub of subs) {
      try {
        const keys = JSON.parse(sub.keys);
        await webpush.sendNotification({ endpoint: sub.endpoint, keys }, payload);
      } catch { /* ignore individual push failures */ }
    }
  } catch { /* push not configured */ }
}

// ── POST /api/forum/posts ──

router.post("/posts", asyncHandler(async (req, res) => {
  const userId = req.auth.userId;
  const { title, content, isAnonymous, attachStudyCard, groupId } = req.body;

  if (!title?.trim() || !content?.trim()) {
    return res.status(400).json({ error: "title and content are required" });
  }

  let studyCard = null;
  if (attachStudyCard) {
    const settings = parsePrivacySettings(
      (await prisma.user.findUnique({ where: { id: userId }, select: { forumPrivacySettings: true } })).forumPrivacySettings
    );
    const logs = await prisma.studyLog.findMany({ where: { userId }, orderBy: { date: "desc" } });
    const totalMinutes = logs.reduce((s, l) => s + l.duration, 0);
    const streak = computeStreak(logs);
    const card = { totalHours: Math.round((totalMinutes / 60) * 10) / 10, streakDays: streak };
    if (settings.weeklyHours) {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      card.weeklyHours = Math.round((logs.filter((l) => l.date >= weekAgo).reduce((s, l) => s + l.duration, 0) / 60) * 10) / 10;
    }
    if (settings.subjectDistribution) {
      const categories = {};
      for (const l of logs) {
        const cat = "通用";
        categories[cat] = (categories[cat] || 0) + l.duration;
      }
      card.subjects = Object.entries(categories).map(([name, minutes]) => ({ name, hours: Math.round((minutes / 60) * 10) / 10 }));
    }
    studyCard = JSON.stringify(card);
  }

  if (groupId) {
    const membership = await prisma.studyGroupMember.findUnique({ where: { groupId_userId: { groupId, userId } } });
    if (!membership) return res.status(403).json({ error: "not a group member" });
  }

  const post = await prisma.post.create({
    data: { title: title.trim(), content: content.trim(), isAnonymous: !!isAnonymous, studyCard, groupId: groupId ?? null, userId },
    include: { user: { select: { id: true, username: true } } },
  });

  return res.status(201).json(formatPost(post, userId));
}));

// ── GET /api/forum/posts ──

router.get("/posts", asyncHandler(async (req, res) => {
  const viewerId = req.auth.userId;
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 20));
  const groupId = req.query.groupId ? Number(req.query.groupId) : null;
  const authorId = req.query.authorId ? Number(req.query.authorId) : null;

  if (groupId) {
    const membership = await prisma.studyGroupMember.findUnique({ where: { groupId_userId: { groupId, userId: viewerId } } });
    if (!membership) return res.status(403).json({ error: "not a group member" });
  }

  const where = {};
  if (groupId) where.groupId = groupId;
  else where.groupId = null;
  if (authorId) where.userId = authorId;

  const [posts, total] = await Promise.all([
    prisma.post.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        user: { select: { id: true, username: true } },
        _count: { select: { comments: true, likes: true } },
      },
    }),
    prisma.post.count({ where }),
  ]);

  return res.json({
    posts: posts.map((p) => formatPost(p, viewerId)),
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
}));

// ── GET /api/forum/posts/:id ──

router.get("/posts/:id", asyncHandler(async (req, res) => {
  const viewerId = req.auth.userId;
  const postId = Number(req.params.id);
  if (!postId) return res.status(400).json({ error: "invalid post id" });

  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: {
      user: { select: { id: true, username: true } },
      comments: {
        orderBy: { createdAt: "asc" },
        include: {
          user: { select: { id: true, username: true } },
          _count: { select: { likes: true } },
        },
      },
      _count: { select: { likes: true } },
    },
  });

  if (!post) return res.status(404).json({ error: "post not found" });

  if (post.groupId) {
    const membership = await prisma.studyGroupMember.findUnique({ where: { groupId_userId: { groupId: post.groupId, userId: viewerId } } });
    if (!membership) return res.status(403).json({ error: "not a group member" });
  }

  let viewerLiked = false;
  if (viewerId) {
    const like = await prisma.postLike.findUnique({ where: { postId_userId: { postId, userId: viewerId } } });
    viewerLiked = !!like;
  }

  const viewerCommentLikes = new Set();
  if (viewerId && post.comments.length) {
    const commentIds = post.comments.map((c) => c.id);
    const myLikes = await prisma.commentLike.findMany({ where: { commentId: { in: commentIds }, userId: viewerId }, select: { commentId: true } });
    for (const l of myLikes) viewerCommentLikes.add(l.commentId);
  }

  return res.json({
    ...formatPost(post, viewerId),
    viewerLiked,
    comments: post.comments.map((c) => ({
      ...formatComment(c, viewerId),
      viewerLiked: viewerCommentLikes.has(c.id),
    })),
  });
}));

// ── PUT /api/forum/posts/:id ──

router.put("/posts/:id", asyncHandler(async (req, res) => {
  const userId = req.auth.userId;
  const postId = Number(req.params.id);
  if (!postId) return res.status(400).json({ error: "invalid post id" });

  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) return res.status(404).json({ error: "post not found" });
  if (post.userId !== userId) return res.status(403).json({ error: "not the author" });

  if (post.groupId) {
    const membership = await prisma.studyGroupMember.findUnique({ where: { groupId_userId: { groupId: post.groupId, userId } } });
    if (!membership) return res.status(403).json({ error: "no longer a group member" });
  }

  const { title, content } = req.body;
  const updated = await prisma.post.update({
    where: { id: postId },
    data: { title: title?.trim() ? title.trim() : undefined, content: content?.trim() ? content.trim() : undefined },
    include: { user: { select: { id: true, username: true } } },
  });

  return res.json(formatPost(updated, userId));
}));

// ── DELETE /api/forum/posts/:id ──

router.delete("/posts/:id", asyncHandler(async (req, res) => {
  const userId = req.auth.userId;
  const postId = Number(req.params.id);
  if (!postId) return res.status(400).json({ error: "invalid post id" });

  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) return res.status(404).json({ error: "post not found" });
  if (post.userId !== userId) return res.status(403).json({ error: "not the author" });

  if (post.groupId) {
    const membership = await prisma.studyGroupMember.findUnique({ where: { groupId_userId: { groupId: post.groupId, userId } } });
    if (!membership) return res.status(403).json({ error: "no longer a group member" });
  }

  await prisma.post.delete({ where: { id: postId } });
  return res.json({ ok: true });
}));

// ── POST /api/forum/posts/:id/comments ──

router.post("/posts/:id/comments", asyncHandler(async (req, res) => {
  const userId = req.auth.userId;
  const postId = Number(req.params.id);
  if (!postId) return res.status(400).json({ error: "invalid post id" });

  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) return res.status(404).json({ error: "post not found" });

  // FIX: check group membership for group posts
  if (post.groupId) {
    const membership = await prisma.studyGroupMember.findUnique({ where: { groupId_userId: { groupId: post.groupId, userId } } });
    if (!membership) return res.status(403).json({ error: "not a group member" });
  }

  const { content, isAnonymous } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: "content is required" });

  const comment = await prisma.comment.create({
    data: { content: content.trim(), isAnonymous: !!isAnonymous, postId, userId },
    include: { user: { select: { id: true, username: true } }, _count: { select: { likes: true } } },
  });

  if (post.userId !== userId) {
    sendForumNotification({
      userId: post.userId,
      type: "comment",
      relatedPostId: postId,
      relatedCommentId: comment.id,
      pushTitle: "新评论",
      pushBody: `${comment.isAnonymous ? "匿名用户" : req.auth.username} 评论了你的帖子`,
    }).catch(() => {});
  }

  return res.status(201).json(formatComment(comment, userId));
}));

// ── DELETE /api/forum/comments/:id ──

router.delete("/comments/:id", asyncHandler(async (req, res) => {
  const userId = req.auth.userId;
  const commentId = Number(req.params.id);
  if (!commentId) return res.status(400).json({ error: "invalid comment id" });

  const comment = await prisma.comment.findUnique({ where: { id: commentId }, include: { post: { select: { groupId: true } } } });
  if (!comment) return res.status(404).json({ error: "comment not found" });
  if (comment.userId !== userId) return res.status(403).json({ error: "not the author" });

  await prisma.comment.delete({ where: { id: commentId } });
  return res.json({ ok: true });
}));

// ── POST /api/forum/posts/:id/like (FIX: handle concurrent race conditions) ──

router.post("/posts/:id/like", asyncHandler(async (req, res) => {
  const userId = req.auth.userId;
  const postId = Number(req.params.id);
  if (!postId) return res.status(400).json({ error: "invalid post id" });

  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) return res.status(404).json({ error: "post not found" });

  const existing = await prisma.postLike.findUnique({ where: { postId_userId: { postId, userId } } });
  if (existing) {
    await prisma.postLike.delete({ where: { id: existing.id } }).catch(() => {});
    return res.json({ liked: false });
  }

  try {
    await prisma.postLike.create({ data: { postId, userId } });
  } catch (e) {
    if (e.code === "P2002") {
      // concurrent like — already liked, treat as toggle
      return res.json({ liked: true });
    }
    throw e;
  }

  if (post.userId !== userId) {
    sendForumNotification({
      userId: post.userId,
      type: "like",
      relatedPostId: postId,
      pushTitle: "新点赞",
      pushBody: `${req.auth.username} 赞了你的帖子`,
    }).catch(() => {});
  }

  return res.json({ liked: true });
}));

// ── POST /api/forum/comments/:id/like (FIX: handle concurrent race conditions) ──

router.post("/comments/:id/like", asyncHandler(async (req, res) => {
  const userId = req.auth.userId;
  const commentId = Number(req.params.id);
  if (!commentId) return res.status(400).json({ error: "invalid comment id" });

  const comment = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!comment) return res.status(404).json({ error: "comment not found" });

  const existing = await prisma.commentLike.findUnique({ where: { commentId_userId: { commentId, userId } } });
  if (existing) {
    await prisma.commentLike.delete({ where: { id: existing.id } }).catch(() => {});
    return res.json({ liked: false });
  }

  try {
    await prisma.commentLike.create({ data: { commentId, userId } });
  } catch (e) {
    if (e.code === "P2002") {
      return res.json({ liked: true });
    }
    throw e;
  }

  if (comment.userId !== userId) {
    sendForumNotification({
      userId: comment.userId,
      type: "like",
      relatedPostId: comment.postId,
      relatedCommentId: commentId,
      pushTitle: "新点赞",
      pushBody: `${req.auth.username} 赞了你的评论`,
    }).catch(() => {});
  }

  return res.json({ liked: true });
}));

// ── GET /api/forum/privacy (FIX: use parsePrivacySettings) ──

router.get("/privacy", asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.auth.userId }, select: { forumPrivacySettings: true } });
  const raw = user?.forumPrivacySettings || "{}";
  let settings;
  try {
    settings = JSON.parse(raw);
  } catch {
    settings = { preset: "privacy" };
  }
  return res.json({ settings });
}));

// ── PUT /api/forum/privacy ──

router.put("/privacy", asyncHandler(async (req, res) => {
  const { preset, overrides } = req.body;
  if (preset && !PRIVACY_PRESETS[preset]) return res.status(400).json({ error: "invalid preset" });
  if (overrides && typeof overrides !== "object") return res.status(400).json({ error: "overrides must be an object" });

  const currentRaw = (await prisma.user.findUnique({ where: { id: req.auth.userId }, select: { forumPrivacySettings: true } })).forumPrivacySettings || "{}";
  let current;
  try {
    current = JSON.parse(currentRaw);
  } catch {
    current = {};
  }

  const updated = {
    ...current,
    ...(preset ? { preset } : {}),
    ...(overrides ? { overrides: { ...(current.overrides || {}), ...overrides } } : {}),
  };

  await prisma.user.update({
    where: { id: req.auth.userId },
    data: { forumPrivacySettings: JSON.stringify(updated) },
  });

  return res.json({ settings: updated });
}));

// ── GET /api/forum/study-card ──

router.get("/study-card", asyncHandler(async (req, res) => {
  const userId = req.auth.userId;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { forumPrivacySettings: true } });
  const settings = parsePrivacySettings(user?.forumPrivacySettings);
  const logs = await prisma.studyLog.findMany({ where: { userId }, orderBy: { date: "desc" } });

  const totalMinutes = logs.reduce((s, l) => s + l.duration, 0);
  const streak = computeStreak(logs);
  const card = { totalHours: Math.round((totalMinutes / 60) * 10) / 10, streakDays: streak };

  if (settings.weeklyHours) {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    card.weeklyHours = Math.round((logs.filter((l) => l.date >= weekAgo).reduce((s, l) => s + l.duration, 0) / 60) * 10) / 10;
  }
  if (settings.subjectDistribution) {
    const cats = {};
    for (const l of logs) { const c = "通用"; cats[c] = (cats[c] || 0) + l.duration; }
    card.subjects = Object.entries(cats).map(([name, minutes]) => ({ name, hours: Math.round((minutes / 60) * 10) / 10 }));
  }
  if (settings.studyCalendar) {
    card.studyDates = logs.map((l) => ({ date: l.date, duration: l.duration }));
  }
  if (settings.aiReport) {
    const recentLogs = logs.slice(0, 7);
    card.recentFeedback = recentLogs.filter((l) => l.aiFeedback).map((l) => ({ date: l.date, feedback: l.aiFeedback }));
  }

  return res.json(card);
}));

// ── GET /api/forum/checkin-wall ──

router.get("/checkin-wall", asyncHandler(async (req, res) => {
  const viewerId = req.auth.userId;
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 20));

  const [entries, total] = await Promise.all([
    prisma.studyLog.findMany({
      where: { sharedToWall: true },
      orderBy: { date: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        user: { select: { id: true, username: true } },
      },
    }),
    prisma.studyLog.count({ where: { sharedToWall: true } }),
  ]);

  const targetIds = entries.map((e) => e.user.id);
  const privacyMap = new Map();
  if (targetIds.length > 0) {
    const users = await prisma.user.findMany({
      where: { id: { in: targetIds } },
      select: { id: true, forumPrivacySettings: true },
    });
    for (const u of users) {
      privacyMap.set(u.id, parsePrivacySettings(u.forumPrivacySettings));
    }
  }

  return res.json({
    entries: entries.map((e) => {
      const settings = privacyMap.get(e.user.id) || {};
      return {
        id: e.id,
        date: e.date,
        duration: e.duration,
        content: settings.totalHours === false ? null : e.content,
        hours: Math.round((e.duration / 60) * 10) / 10,
        author: viewerId === e.user.id
          ? { id: e.user.id, username: e.user.username }
          : { id: e.user.id, username: e.user.username },
        createdAt: e.date,
      };
    }),
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
}));

// ── PATCH /api/forum/study-logs/:id/share ──

router.patch("/study-logs/:id/share", asyncHandler(async (req, res) => {
  const userId = req.auth.userId;
  const logId = Number(req.params.id);
  if (!logId) return res.status(400).json({ error: "invalid log id" });

  const log = await prisma.studyLog.findUnique({ where: { id: logId } });
  if (!log) return res.status(404).json({ error: "study log not found" });
  if (log.userId !== userId) return res.status(403).json({ error: "not the author" });

  const { sharedToWall } = req.body;
  if (typeof sharedToWall !== "boolean") return res.status(400).json({ error: "sharedToWall must be a boolean" });

  const updated = await prisma.studyLog.update({ where: { id: logId }, data: { sharedToWall } });
  return res.json({ id: updated.id, sharedToWall: updated.sharedToWall });
}));

// ── Study Groups ──

router.post("/groups", asyncHandler(async (req, res) => {
  const userId = req.auth.userId;
  const { name, description, tags } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "name is required" });

  // FIX: use $transaction for atomicity
  const group = await prisma.$transaction(async (tx) => {
    const created = await tx.studyGroup.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        tags: tags ? JSON.stringify(Array.isArray(tags) ? tags : [tags]) : null,
        creatorId: userId,
      },
    });

    await tx.studyGroupMember.create({
      data: { groupId: created.id, userId, role: "admin" },
    });

    return created;
  });

  return res.status(201).json({
    ...group,
    tags: group.tags ? JSON.parse(group.tags) : [],
    memberCount: 1,
    myRole: "admin",
  });
}));

router.get("/groups", asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 20));
  const search = req.query.search?.trim();

  const where = search
    ? { OR: [{ name: { contains: search } }, { description: { contains: search } }] }
    : {};

  const [groups, total] = await Promise.all([
    prisma.studyGroup.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { _count: { select: { members: true, posts: true } } },
    }),
    prisma.studyGroup.count({ where }),
  ]);

  return res.json({
    groups: groups.map((g) => ({
      ...g,
      tags: g.tags ? JSON.parse(g.tags) : [],
      memberCount: g._count.members,
      postCount: g._count.posts,
    })),
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
}));

router.get("/groups/:id", asyncHandler(async (req, res) => {
  const groupId = Number(req.params.id);
  if (!groupId) return res.status(400).json({ error: "invalid group id" });

  // FIX: anyone can view basic group info, but membership details only for members
  const group = await prisma.studyGroup.findUnique({
    where: { id: groupId },
    include: {
      _count: { select: { members: true, posts: true } },
      creator: { select: { id: true, username: true } },
    },
  });

  if (!group) return res.status(404).json({ error: "group not found" });

  const myMembership = await prisma.studyGroupMember.findUnique({
    where: { groupId_userId: { groupId, userId: req.auth.userId } },
  });

  let members = [];
  if (myMembership) {
    const memberRecords = await prisma.studyGroupMember.findMany({
      where: { groupId },
      include: { user: { select: { id: true, username: true } } },
      orderBy: { joinedAt: "asc" },
    });
    members = memberRecords.map((m) => ({ userId: m.user.id, username: m.user.username, role: m.role, joinedAt: m.joinedAt }));
  }

  return res.json({
    id: group.id,
    name: group.name,
    description: group.description,
    tags: group.tags ? JSON.parse(group.tags) : [],
    memberCount: group._count.members,
    postCount: group._count.posts,
    creatorId: group.creatorId,
    creator: group.creator,
    myRole: myMembership?.role || null,
    isMember: !!myMembership,
    members,
  });
}));

router.post("/groups/:id/join", asyncHandler(async (req, res) => {
  const userId = req.auth.userId;
  const groupId = Number(req.params.id);
  if (!groupId) return res.status(400).json({ error: "invalid group id" });

  const group = await prisma.studyGroup.findUnique({ where: { id: groupId } });
  if (!group) return res.status(404).json({ error: "group not found" });

  try {
    await prisma.studyGroupMember.create({ data: { groupId, userId, role: "member" } });
  } catch (e) {
    if (e.code === "P2002") return res.status(409).json({ error: "already a member" });
    throw e;
  }

  return res.json({ ok: true });
}));

router.post("/groups/:id/leave", asyncHandler(async (req, res) => {
  const userId = req.auth.userId;
  const groupId = Number(req.params.id);
  if (!groupId) return res.status(400).json({ error: "invalid group id" });

  const member = await prisma.studyGroupMember.findUnique({ where: { groupId_userId: { groupId, userId } } });
  if (!member) return res.status(404).json({ error: "not a member" });

  if (member.role === "admin") {
    const count = await prisma.studyGroupMember.count({ where: { groupId } });
    if (count <= 1) return res.status(400).json({ error: "admin cannot leave as the last member" });
  }

  await prisma.studyGroupMember.delete({ where: { id: member.id } });
  return res.json({ ok: true });
}));

router.delete("/groups/:id/members/:userId", asyncHandler(async (req, res) => {
  const adminId = req.auth.userId;
  const groupId = Number(req.params.id);
  const targetUserId = Number(req.params.userId);
  if (!groupId || !targetUserId) return res.status(400).json({ error: "invalid ids" });

  const adminMember = await prisma.studyGroupMember.findUnique({ where: { groupId_userId: { groupId, userId: adminId } } });
  if (!adminMember || adminMember.role !== "admin") return res.status(403).json({ error: "admin only" });

  const target = await prisma.studyGroupMember.findUnique({ where: { groupId_userId: { groupId, userId: targetUserId } } });
  if (!target) return res.status(404).json({ error: "member not found" });

  await prisma.studyGroupMember.delete({ where: { id: target.id } });
  return res.json({ ok: true });
}));

router.get("/groups/:id/posts", asyncHandler(async (req, res) => {
  const viewerId = req.auth.userId;
  const groupId = Number(req.params.id);
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 20));
  if (!groupId) return res.status(400).json({ error: "invalid group id" });

  const membership = await prisma.studyGroupMember.findUnique({ where: { groupId_userId: { groupId, userId: viewerId } } });
  if (!membership) return res.status(403).json({ error: "not a member" });

  const [posts, total] = await Promise.all([
    prisma.post.findMany({
      where: { groupId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { user: { select: { id: true, username: true } }, _count: { select: { comments: true, likes: true } } },
    }),
    prisma.post.count({ where: { groupId } }),
  ]);

  return res.json({
    posts: posts.map((p) => formatPost(p, viewerId)),
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
}));

// ── Notifications ──

router.get("/notifications", asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 20));
  const unreadOnly = req.query.unread === "true";

  const where = { userId: req.auth.userId, ...(unreadOnly ? { isRead: false } : {}) };

  const [notifs, total] = await Promise.all([
    prisma.forumNotification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.forumNotification.count({ where }),
  ]);

  return res.json({
    notifications: notifs,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
}));

router.get("/notifications/unread-count", asyncHandler(async (req, res) => {
  const count = await prisma.forumNotification.count({ where: { userId: req.auth.userId, isRead: false } });
  return res.json({ count });
}));

router.patch("/notifications/:id/read", asyncHandler(async (req, res) => {
  const notifId = Number(req.params.id);
  if (!notifId) return res.status(400).json({ error: "invalid id" });

  const notif = await prisma.forumNotification.findUnique({ where: { id: notifId } });
  if (!notif || notif.userId !== req.auth.userId) return res.status(404).json({ error: "notification not found" });

  await prisma.forumNotification.update({ where: { id: notifId }, data: { isRead: true } });
  return res.json({ ok: true });
}));

router.patch("/notifications/read-all", asyncHandler(async (req, res) => {
  await prisma.forumNotification.updateMany({ where: { userId: req.auth.userId, isRead: false }, data: { isRead: true } });
  return res.json({ ok: true });
}));

// ── User profile (forum) ──

router.get("/users/:id/profile", asyncHandler(async (req, res) => {
  const targetId = Number(req.params.id);
  const viewerId = req.auth.userId;
  if (!targetId) return res.status(400).json({ error: "invalid user id" });

  const user = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, username: true, forumPrivacySettings: true },
  });
  if (!user) return res.status(404).json({ error: "user not found" });

  const isSelf = targetId === viewerId;
  const settings = parsePrivacySettings(user.forumPrivacySettings);

  const logs = await prisma.studyLog.findMany({ where: { userId: targetId }, orderBy: { date: "desc" } });
  const totalMinutes = logs.reduce((s, l) => s + l.duration, 0);
  const streak = computeStreak(logs);

  const profile = { id: user.id, username: user.username };
  if (isSelf || settings.totalHours) profile.totalHours = Math.round((totalMinutes / 60) * 10) / 10;
  if (isSelf || settings.streakDays) profile.streakDays = streak;
  if (isSelf || settings.weeklyHours) {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    profile.weeklyHours = Math.round((logs.filter((l) => l.date >= weekAgo).reduce((s, l) => s + l.duration, 0) / 60) * 10) / 10;
  }

  const postCount = await prisma.post.count({ where: { userId: targetId } });
  profile.postCount = postCount;

  return res.json(profile);
}));

// ── Error handler for forum routes ──

router.use((err, req, res, next) => {
  console.error("[FORUM ERROR]", err);
  const status = err.code === "P2002" ? 409 : err.code === "P2025" ? 404 : 500;
  res.status(status).json({ error: status === 500 ? "internal error" : err.message || "request failed" });
});

// ── Helpers ──

function formatPost(post, viewerId) {
  const isAuthor = post.user?.id === viewerId;
  const anonymous = post.isAnonymous && !isAuthor;
  return {
    id: post.id,
    title: post.title,
    content: post.content,
    isAnonymous: post.isAnonymous,
    isOwner: isAuthor,
    author: anonymous ? { id: null, username: "匿名用户" } : { id: post.user.id, username: post.user.username },
    studyCard: post.studyCard ? JSON.parse(post.studyCard) : null,
    groupId: post.groupId,
    likeCount: post._count?.likes ?? 0,
    commentCount: post._count?.comments ?? 0,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  };
}

function formatComment(comment, viewerId) {
  const isAuthor = comment.user?.id === viewerId;
  const anonymous = comment.isAnonymous && !isAuthor;
  return {
    id: comment.id,
    content: comment.content,
    isAnonymous: comment.isAnonymous,
    isOwner: isAuthor,
    author: anonymous ? { id: null, username: "匿名用户" } : { id: comment.user.id, username: comment.user.username },
    likeCount: comment._count?.likes ?? 0,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
  };
}

module.exports = router;
