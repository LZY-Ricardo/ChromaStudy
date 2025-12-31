-- AlterTable
ALTER TABLE "Task" ADD COLUMN "plannedDate" TEXT;

-- CreateIndex
CREATE INDEX "Task_plannedDate_idx" ON "Task"("plannedDate");
