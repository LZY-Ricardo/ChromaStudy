## ADDED Requirements

### Requirement: Forum Post Management
The system SHALL allow authenticated users to create, view, edit, and delete forum posts. Posts SHALL support plain text and Markdown content. Users MAY optionally attach a study card (auto-generated learning statistics) when creating a post. Users MAY create posts anonymously, which hides their identity from other users.

#### Scenario: Create a public post
- **WHEN** an authenticated user submits a post with title and content
- **THEN** the post is created with the user as author, visible to all users, and appears in the forum feed

#### Scenario: Create an anonymous post
- **WHEN** an authenticated user submits a post with `isAnonymous: true`
- **THEN** the post is created with the real userId stored internally, but displayed as "匿名用户" to other users. The author can see their own anonymous posts in their post history

#### Scenario: Create a post with study card
- **WHEN** an authenticated user creates a post with `attachStudyCard: true`
- **THEN** the system generates a study card from the user's learning data (total hours, streak, weekly stats), attaches it as JSON metadata to the post, and respects the user's privacy settings when generating the card

#### Scenario: Edit own post
- **WHEN** the post author edits their post content or title
- **THEN** the post is updated with an `updatedAt` timestamp

#### Scenario: Delete own post
- **WHEN** the post author deletes their post
- **THEN** the post and all associated comments and likes are removed

#### Scenario: View post feed
- **WHEN** a user requests the post feed with pagination (page, pageSize)
- **THEN** the system returns posts sorted by creation time (newest first), with author info (or "匿名用户"), like count, comment count, and study card if attached

### Requirement: Forum Comment
The system SHALL allow authenticated users to add comments to forum posts. Comments SHALL support plain text and Markdown. Users MAY comment anonymously. v1 supports only one-level comments (no nested replies).

#### Scenario: Comment on a post
- **WHEN** an authenticated user submits a comment on a post
- **THEN** the comment is created and linked to the post, and the post's comment count is incremented

#### Scenario: Anonymous comment
- **WHEN** an authenticated user submits a comment with `isAnonymous: true`
- **THEN** the comment displays as "匿名用户" to other users, while the real userId is stored internally

#### Scenario: Delete own comment
- **WHEN** the comment author deletes their comment
- **THEN** the comment is removed and the post's comment count is decremented

### Requirement: Post Like
The system SHALL allow authenticated users to like and unlike posts. A user MAY only like a post once.

#### Scenario: Like a post
- **WHEN** an authenticated user likes a post they have not yet liked
- **THEN** the post's like count is incremented and the like record is created

#### Scenario: Unlike a post
- **WHEN** an authenticated user unlikes a post they previously liked
- **THEN** the post's like count is decremented and the like record is removed

#### Scenario: Prevent duplicate likes
- **WHEN** an authenticated user attempts to like a post they already liked
- **THEN** the request returns a conflict error

### Requirement: Comment Like
The system SHALL allow authenticated users to like and unlike comments. A user MAY only like a comment once.

#### Scenario: Like a comment
- **WHEN** an authenticated user likes a comment they have not yet liked
- **THEN** the comment's like count is incremented

#### Scenario: Unlike a comment
- **WHEN** an authenticated user unlikes a comment they previously liked
- **THEN** the comment's like count is decremented

### Requirement: Study Card Generation
The system SHALL provide an API to generate a study card for the authenticated user based on their learning data. The study card SHALL respect the user's privacy settings and only include data the user has consented to share.

#### Scenario: Generate study card with default privacy settings
- **WHEN** a user requests a study card with "privacy" preset (default)
- **THEN** the card includes total study hours and streak days only. Subject distribution, study calendar, and AI reports are excluded

#### Scenario: Generate study card with social privacy settings
- **WHEN** a user requests a study card with "social" preset
- **THEN** the card includes total study hours, weekly hours, streak days, and subject distribution

#### Scenario: Generate study card with open privacy settings
- **WHEN** a user requests a study card with "open" preset
- **THEN** the card includes all available data: total hours, weekly hours, streak days, subject distribution, study calendar heatmap, and optionally AI weekly report

#### Scenario: Privacy overrides take precedence
- **WHEN** a user has preset "privacy" but has overridden "studyCalendar" to true
- **THEN** the study card includes study calendar heatmap in addition to the default privacy preset fields

### Requirement: Forum Privacy Settings
The system SHALL allow users to control what learning data is visible to other users in the forum. Users SHALL choose from three presets (privacy, social, open) and MAY override individual fields. Privacy settings ONLY affect what other users see — the user always sees their own full data.

#### Scenario: Default privacy on new user
- **WHEN** a new user account is created
- **THEN** their forum privacy settings default to `{"preset":"privacy"}` with no overrides

#### Scenario: Change privacy preset
- **WHEN** a user updates their privacy preset to "social"
- **THEN** all fields not explicitly overridden follow the "social" preset rules

#### Scenario: Override individual field
- **WHEN** a user adds an override for "studyCalendar" to true while on "privacy" preset
- **THEN** the study calendar becomes visible to others, while other fields remain at the "privacy" preset level

#### Scenario: Author views own profile
- **WHEN** a user views their own forum profile
- **THEN** all learning data is displayed regardless of privacy settings

### Requirement: Study Check-in Wall
The system SHALL provide a check-in wall where users can share their daily study records. Users MAY opt in to share individual study logs to the check-in wall. Other users MAY view and like check-in entries.

#### Scenario: Share study log to check-in wall
- **WHEN** a user toggles `sharedToWall` on one of their study logs
- **THEN** that study log entry appears on the check-in wall feed with the user's study duration and content (respecting privacy settings)

#### Scenario: View check-in wall
- **WHEN** a user requests the check-in wall feed with pagination
- **THEN** the system returns shared study log entries sorted by date (newest first), with anonymized data based on each user's privacy settings

#### Scenario: Like a check-in entry
- **WHEN** an authenticated user likes a check-in wall entry
- **THEN** the entry's like count is incremented

### Requirement: Study Group
The system SHALL allow authenticated users to create and join study groups. Each group has a name, description, and optional tags. The group creator has admin privileges. Group members can post within the group's dedicated discussion area.

#### Scenario: Create a study group
- **WHEN** an authenticated user creates a study group with name, description, and optional tags
- **THEN** the group is created with the creator as admin member

#### Scenario: Join a study group
- **WHEN** an authenticated user joins an open study group
- **THEN** the user is added as a regular member and can view and post in the group

#### Scenario: Post within a group
- **WHEN** a group member creates a post within a study group
- **THEN** the post is visible only to members of that group

#### Scenario: Group creator can remove members
- **WHEN** the group admin removes a member
- **THEN** the member is removed from the group and can no longer view or post in the group

### Requirement: Forum Notification
The system SHALL send push notifications to users for forum events (new comment on post, new like on post, new comment like, group invite) by reusing the existing Web Push infrastructure.

#### Scenario: Notify on new comment
- **WHEN** another user comments on a user's post
- **THEN** a push notification is sent to the post author

#### Scenario: Notify on new like
- **WHEN** another user likes a user's post or comment
- **THEN** a push notification is sent to the post/comment author

#### Scenario: Notify on group invite
- **WHEN** a user is invited to a study group
- **THEN** a push notification is sent to the invited user

#### Scenario: User can disable forum notifications
- **WHEN** a user disables forum notifications in settings
- **THEN** no forum-related push notifications are sent to that user
