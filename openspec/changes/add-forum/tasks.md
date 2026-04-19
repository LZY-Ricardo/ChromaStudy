## 1. Database Schema
- [ ] 1.1 Add `forumPrivacySettings` JSON field to User model (default `{"preset":"privacy"}`)
- [ ] 1.2 Add `sharedToWall` Boolean field to StudyLog model (default `false`)
- [ ] 1.3 Create Post model (id, title, content, isAnonymous, studyCard JSON, groupId?, userId, createdAt, updatedAt)
- [ ] 1.4 Create Comment model (id, content, isAnonymous, postId, userId, createdAt, updatedAt)
- [ ] 1.5 Create PostLike model (id, postId, userId, unique constraint on [postId, userId])
- [ ] 1.6 Create CommentLike model (id, commentId, userId, unique constraint on [commentId, userId])
- [ ] 1.7 Create StudyGroup model (id, name, description, tags JSON, creatorId, createdAt)
- [ ] 1.8 Create StudyGroupMember model (id, groupId, userId, role enum [admin, member], joinedAt)
- [ ] 1.9 Create ForumNotification model (id, type enum, userId, relatedPostId?, relatedCommentId?, relatedGroupId?, isRead, createdAt)
- [ ] 1.10 Add necessary indexes (Post.userId, Post.groupId, Post.createdAt, Comment.postId, StudyGroupMember.groupId, etc.)
- [ ] 1.11 Run Prisma migration and verify schema

## 2. Backend API — Post & Comment
- [ ] 2.1 `POST /api/forum/posts` — Create post (with optional studyCard and isAnonymous)
- [ ] 2.2 `GET /api/forum/posts` — List posts (paginated, filter by groupId for group posts)
- [ ] 2.3 `GET /api/forum/posts/:id` — Get post detail (with comments)
- [ ] 2.4 `PUT /api/forum/posts/:id` — Update own post
- [ ] 2.5 `DELETE /api/forum/posts/:id` — Delete own post
- [ ] 2.6 `POST /api/forum/posts/:id/comments` — Add comment (with optional isAnonymous)
- [ ] 2.7 `DELETE /api/forum/comments/:id` — Delete own comment

## 3. Backend API — Likes
- [ ] 3.1 `POST /api/forum/posts/:id/like` — Like/unlike toggle for post
- [ ] 3.2 `POST /api/forum/comments/:id/like` — Like/unlike toggle for comment

## 4. Backend API — Privacy & Study Card
- [ ] 4.1 `GET /api/forum/privacy` — Get current user's privacy settings
- [ ] 4.2 `PUT /api/forum/privacy` — Update privacy preset and/or overrides
- [ ] 4.3 `GET /api/forum/study-card` — Generate study card data based on privacy settings
- [ ] 4.4 Implement privacy filter middleware that applies to all user-facing forum APIs

## 5. Backend API — Check-in Wall
- [ ] 5.1 `PATCH /api/study-logs/:id/share` — Toggle sharedToWall on study log
- [ ] 5.2 `GET /api/forum/checkin-wall` — Get paginated check-in wall feed (aggregated from StudyLog where sharedToWall=true)

## 6. Backend API — Study Groups
- [ ] 6.1 `POST /api/forum/groups` — Create study group
- [ ] 6.2 `GET /api/forum/groups` — List public groups (paginated, searchable)
- [ ] 6.3 `GET /api/forum/groups/:id` — Get group detail (members, posts)
- [ ] 6.4 `POST /api/forum/groups/:id/join` — Join a group
- [ ] 6.5 `POST /api/forum/groups/:id/leave` — Leave a group
- [ ] 6.6 `DELETE /api/forum/groups/:id/members/:userId` — Admin remove member
- [ ] 6.7 `GET /api/forum/groups/:id/posts` — Get group posts (paginated)

## 7. Backend API — Notifications
- [ ] 7.1 `GET /api/forum/notifications` — Get current user's forum notifications (paginated, filter by isRead)
- [ ] 7.2 `PATCH /api/forum/notifications/:id/read` — Mark notification as read
- [ ] 7.3 Integrate forum notification dispatch into post/comment/like flows (reuse Web Push)
- [ ] 7.4 Add forum notification toggle to user settings API

## 8. Frontend — Forum Pages
- [ ] 8.1 Create forum layout and routing (/forum, /forum/post/:id, /forum/group/:id)
- [ ] 8.2 Post feed page — list posts with infinite scroll, study card preview, like/comment counts
- [ ] 8.3 Post detail page — full post content, study card display, comments list, comment input
- [ ] 8.4 Create post page — title, content (Markdown), toggle anonymous, toggle study card, select group (optional)
- [ ] 8.5 User profile page — display learning stats per privacy settings, user's posts list

## 9. Frontend — Check-in Wall
- [ ] 9.1 Check-in wall page — paginated feed of shared study logs with like button
- [ ] 9.2 Add "share to wall" toggle on study log detail page

## 10. Frontend — Study Groups
- [ ] 10.1 Group list page — search and browse groups, create group button
- [ ] 10.2 Group detail page — group info, member list, group post feed
- [ ] 10.3 Create group modal — name, description, tags

## 11. Frontend — Settings & Privacy
- [ ] 11.1 Privacy settings page — preset selector (privacy/social/open) with visual preview, individual field toggles
- [ ] 11.2 Forum notification toggle in existing settings page

## 12. Frontend — Notifications
- [ ] 12.1 Forum notification list page — grouped by type, mark as read
- [ ] 12.2 Forum notification badge on forum tab

## 13. Integration & Polish
- [ ] 13.1 Add "Forum" tab to bottom navigation bar
- [ ] 13.2 Add forum-related icons and assets
- [ ] 13.3 Mobile-responsive layout testing for all forum pages
- [ ] 13.4 API error handling and loading states for all forum components
