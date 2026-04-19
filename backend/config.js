const path = require("path");

require("dotenv").config({ path: path.join(__dirname, ".env") });

module.exports = {
  PORT: Number(process.env.PORT) || 3001,
  ollamaHost: process.env.OLLAMA_HOST || "http://localhost:11434",
  ollamaModel: process.env.OLLAMA_MODEL || "llama3",
  OCCURRENCE_LOOKBACK_DAYS: 30,
  OCCURRENCE_LOOKAHEAD_DAYS: 90,
  REMINDER_LOOKAHEAD_DAYS: 30,
  DONE_RETENTION_DAYS: 30,
  JWT_ISSUER: process.env.JWT_ISSUER || "chroma-study",
  JWT_AUDIENCE: process.env.JWT_AUDIENCE || "chroma-study-api",
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || "dev-access-secret-change-me",
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || "dev-refresh-secret-change-me",
  ACCESS_TOKEN_TTL: process.env.ACCESS_TOKEN_TTL || "15m",
  REFRESH_TOKEN_TTL: process.env.REFRESH_TOKEN_TTL || "30d",
  BCRYPT_COST: Number(process.env.BCRYPT_COST) || 10,
  VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY || "",
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY || "",
  VAPID_SUBJECT: process.env.VAPID_SUBJECT || "mailto:admin@example.com",
  PUSH_READY: Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
  PUSH_URGENCY: "normal",
  PUSH_TTL_SECONDS: 60 * 60,
};
