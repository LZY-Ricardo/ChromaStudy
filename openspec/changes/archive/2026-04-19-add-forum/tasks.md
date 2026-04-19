## 1. Database Schema
- [x] 1.1 Add `forumPrivacySettings` JSON field to User model (default `{"preset":"privacy"}`)
- [x] 1.2 Add `sharedToWall` Boolean field to StudyLog model (default `false`)
- [x] 1.3 Create Post model (id, title, content, isAnonymous, studyCard JSON, groupId?, userId, createdAt, updatedAt)
- [x] 1.4 Create Comment model (id, content, isAnonymous, postId, userId, createdAt, updatedAt)
- [x] 1.5 Create PostLike model (id, postId, userId, unique constraint on [postId, userId])
- [x] 1.6 Create CommentLike model (id, commentId, userId, unique constraint on [commentId, userId])
- [x] 1.7 Create StudyGroup model (id, name, description, tags JSON, creatorId, createdAt)
- [x] 1.8 Create StudyGroupMember model (id, groupId, userId, role enum [admin, member], joinedAt)
- [x] 1.9 Create ForumNotification model (id, type enum, userId, relatedPostId?, relatedCommentId?, relatedGroupId?, isRead, createdAt)
- [x] 1.10 Add necessary indexes (Post.userId, Post.groupId, Post.createdAt, Comment.postId, StudyGroupMember.groupId, etc.)
- [x] 1.11 Run Prisma migration and verify schema

## 2. Backend API — Post & Comment
- [x] 2.1 `POST /api/forum/posts` — Create post (with optional studyCard and isAnonymous)
- [x] 2.2 `GET /api/forum/posts` — List posts (paginated, filter by groupId for group posts)
- [x] 2.3 `GET /api/forum/posts/:id` — Get post detail (with comments)
- [x] 2.4 `PUT /api/forum/posts/:id` — Update own post
- [x] 2.5 `DELETE /api/forum/posts/:id` — Delete own post
- [x] 2.6 `POST /api/forum/posts/:id/comments` — Add comment (with optional isAnonymous)
- [x] 2.7 `DELETE /api/forum/comments/:id` — Delete own comment

## 3. Backend API — Likes
- [x] 3.1 `POST /api/forum/posts/:id/like` — Like/unlike toggle for post
- [x] 3.2 `POST /api/forum/comments/:id/like` — Like/unlike toggle for comment

## 4. Backend API — Privacy & Study Card
- [x] 4.1 `GET /api/forum/privacy` — Get current user's privacy settings
- [x] 4.2 `PUT /api/forum/privacy` — Update privacy preset and/or overrides
- [x] 4.3 `GET /api/forum/study-card` — Generate study card data based on privacy settings
- [x] 4.4 Implement privacy filter middleware that applies to all user-facing forum APIs

## 5. Backend API — Check-in Wall
- [x] 5.1 `PATCH /api/study-logs/:id/share` — Toggle sharedToWall on study log
- [x] 5.2 `GET /api/forum/checkin-wall` — Get paginated check-in wall feed (aggregated from StudyLog where sharedToWall=true)

## 6. Backend API — Study Groups
- [x] 6.1 `POST /api/forum/groups` — Create study group
- [x] 6.2 `GET /api/forum/groups` — List public groups (paginated, searchable)
- [x] 6.3 `GET /api/forum/groups/:id` — Get group detail (members, posts)
- [x] 6.4 `POST /api/forum/groups/:id/join` — Join a group
- [x] 6.5 `POST /api/forum/groups/:id/leave` — Leave a group
- [x] 6.6 `DELETE /api/forum/groups/:id/members/:userId` — Admin remove member
- [x] 6.7 `GET /api/forum/groups/:id/posts` — Get group posts (paginated)

## 7. Backend API — Notifications
- [x] 7.1 `GET /api/forum/notifications` — Get current user's forum notifications (paginated, filter by isRead)
- [x] 7.2 `PATCH /api/forum/notifications/:id/read` — Mark notification as read
- [x] 7.3 Integrate forum notification dispatch into post/comment/like flows (reuse Web Push)
- [x] 7.4 Add forum notification toggle to user settings API

## 8. Frontend — Forum Pages
- [x] 8.1 Create forum layout and routing (/forum, /forum/post/:id, /forum/group/:id)
- [x] 8.2 Post feed page — list posts with infinite scroll, study card preview, like/comment counts
- [x] 8.3 Post detail page — full post content, study card display, comments list, comment input
- [x] 8.4 Create post page — title, content (Markdown), toggle anonymous, toggle study card, select group (optional)
- [x] 8.5 User profile page — display learning stats per privacy settings, user's posts list

## 9. Frontend — Check-in Wall
- [x] 9.1 Check-in wall page — paginated feed of shared study logs with like button
- [x] 9.2 Add "share to wall" toggle on study log detail page

## 10. Frontend — Study Groups
- [x] 10.1 Group list page — search and browse groups, create group button
- [x] 10.2 Group detail page — group info, member list, group post feed
- [x] 10.3 Create group modal — name, description, tags

## 11. Frontend — Settings & Privacy
- [x] 11.1 Privacy settings page — preset selector (privacy/social/open) with visual preview, individual field toggles
- [x] 11.2 Forum notification toggle in existing settings page

## 12. Frontend — Notifications
- [x] 12.1 Forum notification list page — grouped by type, mark as read
- [x] 12.2 Forum notification badge on forum tab

## 13. Integration & Polish
- [x] 13.1 Add "Forum" tab to bottom navigation bar
- [x] 13.2 Add forum-related icons and assets
- [x] 13.3 Mobile-responsive layout testing for all forum pages
- [x] 13.4 API error handling and loading states for all forum components
