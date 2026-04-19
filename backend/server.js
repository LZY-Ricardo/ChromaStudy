const express = require("express");
const cors = require("cors");
const { CronJob } = require("cron");
const webpush = require("web-push");
const { prisma } = require("./prismaClient");
const config = require("./config");
const { setupAuthMiddleware } = require("./middleware/auth");
const { sendDueReminders, refreshAllReminders, cleanupOldRecords } = require("./utils/taskReminderUtils");

const app = express();
app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  console.log(`[REQUEST] ${req.method} ${req.url}`, { body: req.body });
  next();
});

if (config.PUSH_READY) {
  webpush.setVapidDetails(config.VAPID_SUBJECT, config.VAPID_PUBLIC_KEY, config.VAPID_PRIVATE_KEY);
}

if (!process.env.JWT_ACCESS_SECRET || !process.env.JWT_REFRESH_SECRET) {
  console.warn(
    "[AUTH] JWT_ACCESS_SECRET/JWT_REFRESH_SECRET are not set. Using built-in dev defaults; do NOT use in production."
  );
}

setupAuthMiddleware(app);

app.use("/api", require("./routes/authRoutes"));
app.use("/api", require("./routes/userRoutes"));
app.use("/api", require("./routes/studyLogRoutes"));
app.use("/api", require("./routes/taskRoutes"));
app.use("/api", require("./routes/pushRoutes"));
app.use("/api", require("./routes/aiRoutes"));
app.use("/api", require("./routes/chatRoutes"));
app.use("/api/forum", require("./forumRoutes"));

if (config.PUSH_READY) {
  CronJob.from({
    cronTime: "* * * * *",
    onTick: () => {
      sendDueReminders().catch((error) => console.error("reminder tick failed", error));
    },
    start: true,
  });
} else {
  console.warn("Push is not configured. Reminder delivery disabled.");
}

CronJob.from({
  cronTime: "10 0 * * *",
  onTick: () => {
    refreshAllReminders().catch((error) => console.error("reminder refresh failed", error));
  },
  start: true,
});

CronJob.from({
  cronTime: "20 0 * * *",
  onTick: () => {
    cleanupOldRecords().catch((error) => console.error("cleanup failed", error));
  },
  start: true,
});

setTimeout(() => {
  refreshAllReminders().catch((error) => console.error("reminder warmup failed", error));
}, 2000);

module.exports = { app };

if (require.main === module) {
  app.listen(config.PORT, () => {
    console.log(`Server is running on port ${config.PORT}`);
  });

  process.on("SIGINT", async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}
