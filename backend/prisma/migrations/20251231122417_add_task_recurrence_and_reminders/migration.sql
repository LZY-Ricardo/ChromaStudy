-- AlterTable
ALTER TABLE "Task" ADD COLUMN "category" TEXT;
ALTER TABLE "Task" ADD COLUMN "description" TEXT;
ALTER TABLE "Task" ADD COLUMN "dueTime" TEXT;
ALTER TABLE "Task" ADD COLUMN "labels" TEXT;
ALTER TABLE "Task" ADD COLUMN "priority" INTEGER;
ALTER TABLE "Task" ADD COLUMN "reminderTimes" TEXT;
ALTER TABLE "Task" ADD COLUMN "repeatRule" TEXT;
ALTER TABLE "Task" ADD COLUMN "repeatStartDate" TEXT;
ALTER TABLE "Task" ADD COLUMN "repeatTimeZone" TEXT;

-- CreateTable
CREATE TABLE "TaskOccurrenceOverride" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "taskId" INTEGER NOT NULL,
    "occurrenceDate" TEXT NOT NULL,
    "overrideDate" TEXT,
    "title" TEXT,
    "description" TEXT,
    "dueTime" TEXT,
    "priority" INTEGER,
    "category" TEXT,
    "labels" TEXT,
    "isCancelled" BOOLEAN NOT NULL DEFAULT false,
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TaskOccurrenceOverride_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaskReminderInstance" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "taskId" INTEGER NOT NULL,
    "occurrenceDate" TEXT NOT NULL,
    "remindAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sentAt" DATETIME,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TaskReminderInstance_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "endpoint" TEXT NOT NULL,
    "keys" TEXT NOT NULL,
    "expirationTime" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" DATETIME,
    CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TaskOccurrenceOverride_occurrenceDate_idx" ON "TaskOccurrenceOverride"("occurrenceDate");

-- CreateIndex
CREATE UNIQUE INDEX "TaskOccurrenceOverride_taskId_occurrenceDate_key" ON "TaskOccurrenceOverride"("taskId", "occurrenceDate");

-- CreateIndex
CREATE INDEX "TaskReminderInstance_remindAt_status_idx" ON "TaskReminderInstance"("remindAt", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TaskReminderInstance_taskId_occurrenceDate_remindAt_key" ON "TaskReminderInstance"("taskId", "occurrenceDate", "remindAt");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE INDEX "Task_repeatRule_idx" ON "Task"("repeatRule");

-- CreateIndex
CREATE INDEX "Task_userId_idx" ON "Task"("userId");
