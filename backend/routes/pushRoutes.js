const { Router } = require("express");
const { prisma } = require("../prismaClient");
const { asyncHandler } = require("../middleware/auth");
const config = require("../config");

const router = Router();

router.get(
  "/push/vapid-public-key",
  asyncHandler(async (req, res) => {
    if (!config.PUSH_READY) {
      return res.status(500).json({ error: "push is not configured" });
    }
    return res.json({ publicKey: config.VAPID_PUBLIC_KEY });
  })
);

router.post(
  "/push/subscribe",
  asyncHandler(async (req, res) => {
    const payload = req.body || {};
    const userId = Number(req.auth?.userId);
    const subscription = payload.subscription || {};
    const endpoint = typeof subscription.endpoint === "string" ? subscription.endpoint.trim() : "";
    const keys = subscription.keys || {};

    if (!config.PUSH_READY) {
      return res.status(500).json({ error: "push is not configured" });
    }
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({ error: "unauthorized", code: "UNAUTHORIZED" });
    }
    if (!endpoint || typeof keys?.p256dh !== "string" || typeof keys?.auth !== "string") {
      return res.status(400).json({ error: "invalid subscription" });
    }

    const record = await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: {
        userId,
        endpoint,
        keys: JSON.stringify({ p256dh: keys.p256dh, auth: keys.auth }),
        expirationTime:
          subscription.expirationTime != null ? String(subscription.expirationTime) : null,
      },
      update: {
        userId,
        keys: JSON.stringify({ p256dh: keys.p256dh, auth: keys.auth }),
        expirationTime:
          subscription.expirationTime != null ? String(subscription.expirationTime) : null,
        lastUsedAt: new Date(),
      },
    });

    return res.json({ ok: true, id: record.id });
  })
);

router.post(
  "/push/unsubscribe",
  asyncHandler(async (req, res) => {
    const payload = req.body || {};
    const userId = Number(req.auth?.userId);
    const endpoint =
      typeof payload.endpoint === "string"
        ? payload.endpoint.trim()
        : typeof payload.subscription?.endpoint === "string"
          ? payload.subscription.endpoint.trim()
          : "";

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({ error: "unauthorized", code: "UNAUTHORIZED" });
    }
    if (!endpoint) {
      return res.status(400).json({ error: "endpoint is required" });
    }

    await prisma.pushSubscription.deleteMany({
      where: { userId, endpoint },
    });

    return res.json({ ok: true });
  })
);

module.exports = router;
