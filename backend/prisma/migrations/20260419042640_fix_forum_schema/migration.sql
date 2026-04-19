-- DropForeignKey
ALTER TABLE `post` DROP FOREIGN KEY `Post_groupId_fkey`;

-- CreateIndex
CREATE INDEX `ForumNotification_relatedPostId_idx` ON `ForumNotification`(`relatedPostId`);

-- CreateIndex
CREATE INDEX `ForumNotification_relatedCommentId_idx` ON `ForumNotification`(`relatedCommentId`);

-- AddForeignKey
ALTER TABLE `Post` ADD CONSTRAINT `Post_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `StudyGroup`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ForumNotification` ADD CONSTRAINT `ForumNotification_relatedPostId_fkey` FOREIGN KEY (`relatedPostId`) REFERENCES `Post`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ForumNotification` ADD CONSTRAINT `ForumNotification_relatedCommentId_fkey` FOREIGN KEY (`relatedCommentId`) REFERENCES `Comment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ForumNotification` ADD CONSTRAINT `ForumNotification_relatedGroupId_fkey` FOREIGN KEY (`relatedGroupId`) REFERENCES `StudyGroup`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
