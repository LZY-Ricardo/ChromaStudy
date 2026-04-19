const { Router } = require("express");
const jwt = require("jsonwebtoken");
const { prisma } = require("../prismaClient");
const { asyncHandler, normalizeUsername, normalizePassword, looksLikeBcryptHash, hashPassword, verifyPassword, createTokenPair } = require("../middleware/auth");
const config = require("../config");

const router = Router();

router.get("/health", (req, res) => {
  res.json({ ok: true });
});

router.post(
  "/register",
  asyncHandler(async (req, res) => {
    console.log('[REGISTER] Request body:', req.body);
    const username = normalizeUsername(req.body?.username);
    const password = normalizePassword(req.body?.password);
    console.log('[REGISTER] Normalized - username:', username, 'password length:', password.length);

    if (!username || !password) {
      return res.status(400).json({ error: "username and password are required" });
    }

    if (username.length < 3 || username.length > 32) {
      return res.status(400).json({ error: "username must be 3-32 characters" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "password must be at least 6 characters" });
    }

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return res.status(409).json({ error: "username already exists" });
    }

    const created = await prisma.user.create({
      data: { username, password: await hashPassword(password) },
    });

    const user = { id: created.id, username: created.username };
    const tokens = createTokenPair(user);

    await prisma.refreshToken.create({
      data: {
        tokenId: tokens.refreshTokenId,
        userId: user.id,
        expiresAt: tokens.refreshExpiresAt,
      },
    });

    return res.status(201).json({
      user,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  })
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const username = normalizeUsername(req.body?.username);
    const password = normalizePassword(req.body?.password);

    if (!username || !password) {
      return res.status(400).json({ error: "username and password are required" });
    }

    const existing = await prisma.user.findUnique({ where: { username } });
    if (!existing) {
      return res.status(401).json({ error: "invalid credentials" });
    }

    const ok = await verifyPassword(password, existing.password);
    if (!ok) {
      return res.status(401).json({ error: "invalid credentials" });
    }

    if (!looksLikeBcryptHash(existing.password)) {
      prisma.user
        .update({
          where: { id: existing.id },
          data: { password: await hashPassword(password) },
        })
        .catch(() => {});
    }

    const user = { id: existing.id, username: existing.username };
    const tokens = createTokenPair(user);

    await prisma.refreshToken.create({
      data: {
        tokenId: tokens.refreshTokenId,
        userId: user.id,
        expiresAt: tokens.refreshExpiresAt,
      },
    });

    return res.json({
      user,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  })
);

router.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const refreshToken = typeof req.body?.refreshToken === "string" ? req.body.refreshToken.trim() : "";
    if (!refreshToken) {
      return res.status(400).json({ error: "refreshToken is required" });
    }

    let payload;
    try {
      payload = jwt.verify(refreshToken, config.JWT_REFRESH_SECRET, {
        algorithms: ["HS256"],
        issuer: config.JWT_ISSUER,
        audience: config.JWT_AUDIENCE,
      });
    } catch (error) {
      if (error?.name === "TokenExpiredError") {
        return res.status(401).json({ error: "refresh token expired", code: "REFRESH_TOKEN_EXPIRED" });
      }
      return res.status(401).json({ error: "invalid refresh token", code: "INVALID_REFRESH_TOKEN" });
    }

    if (payload?.type !== "refresh") {
      return res.status(401).json({ error: "invalid token type", code: "INVALID_REFRESH_TOKEN" });
    }

    const subject = typeof payload?.sub === "string" ? payload.sub : "";
    const userId = Number(subject);
    const tokenId = typeof payload?.jti === "string" ? payload.jti : "";

    if (!Number.isInteger(userId) || userId <= 0 || !tokenId) {
      return res.status(401).json({ error: "invalid refresh token", code: "INVALID_REFRESH_TOKEN" });
    }

    const record = await prisma.refreshToken.findUnique({ where: { tokenId } });
    if (!record || record.userId !== userId) {
      return res.status(401).json({ error: "invalid refresh token", code: "INVALID_REFRESH_TOKEN" });
    }
    if (record.revokedAt) {
      return res.status(401).json({ error: "refresh token revoked", code: "REFRESH_TOKEN_REVOKED" });
    }
    if (record.expiresAt && record.expiresAt.getTime() <= Date.now()) {
      return res.status(401).json({ error: "refresh token expired", code: "REFRESH_TOKEN_EXPIRED" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true },
    });
    if (!user) {
      return res.status(401).json({ error: "invalid refresh token", code: "INVALID_REFRESH_TOKEN" });
    }

    const next = createTokenPair(user);

    await prisma.$transaction([
      prisma.refreshToken.update({
        where: { tokenId },
        data: {
          revokedAt: new Date(),
          replacedByTokenId: next.refreshTokenId,
        },
      }),
      prisma.refreshToken.create({
        data: {
          tokenId: next.refreshTokenId,
          userId,
          expiresAt: next.refreshExpiresAt,
        },
      }),
    ]);

    return res.json({
      user,
      accessToken: next.accessToken,
      refreshToken: next.refreshToken,
    });
  })
);

router.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const refreshToken = typeof req.body?.refreshToken === "string" ? req.body.refreshToken.trim() : "";
    if (!refreshToken) {
      return res.json({ ok: true });
    }

    try {
      const payload = jwt.verify(refreshToken, config.JWT_REFRESH_SECRET, {
        algorithms: ["HS256"],
        issuer: config.JWT_ISSUER,
        audience: config.JWT_AUDIENCE,
      });

      const tokenId = typeof payload?.jti === "string" ? payload.jti : "";
      if (tokenId) {
        await prisma.refreshToken.updateMany({
          where: { tokenId },
          data: { revokedAt: new Date() },
        });
      }
    } catch {
      // ignore invalid refresh tokens
    }

    return res.json({ ok: true });
  })
);

module.exports = router;
