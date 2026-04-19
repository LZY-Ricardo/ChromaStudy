const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const config = require("../config");

function asyncHandler(handler) {
  return (req, res) => {
    Promise.resolve(handler(req, res)).catch((error) => {
      console.error('Error details:', error.message);
      console.error('Stack:', error.stack);
      res.status(500).json({ error: "Internal Server Error", message: error.message });
    });
  };
}

function looksLikeBcryptHash(value) {
  return typeof value === "string" && /^\$2[aby]\$/.test(value);
}

async function hashPassword(password) {
  return bcrypt.hash(String(password), config.BCRYPT_COST);
}

async function verifyPassword(password, storedHashOrPlain) {
  const stored = String(storedHashOrPlain || "");
  if (looksLikeBcryptHash(stored)) {
    return bcrypt.compare(String(password), stored);
  }
  return String(password) === stored;
}

function normalizeUsername(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePassword(value) {
  return typeof value === "string" ? value : "";
}

function generateTokenId() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return crypto.randomBytes(16).toString("hex");
}

function signAccessToken(user) {
  return jwt.sign(
    { type: "access", username: user.username },
    config.JWT_ACCESS_SECRET,
    {
      algorithm: "HS256",
      expiresIn: config.ACCESS_TOKEN_TTL,
      issuer: config.JWT_ISSUER,
      audience: config.JWT_AUDIENCE,
      subject: String(user.id),
    }
  );
}

function signRefreshToken(user, tokenId) {
  return jwt.sign({ type: "refresh" }, config.JWT_REFRESH_SECRET, {
    algorithm: "HS256",
    expiresIn: config.REFRESH_TOKEN_TTL,
    issuer: config.JWT_ISSUER,
    audience: config.JWT_AUDIENCE,
    subject: String(user.id),
    jwtid: tokenId,
  });
}

function createTokenPair(user) {
  const tokenId = generateTokenId();
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user, tokenId);

  const decoded = jwt.decode(refreshToken);
  const expSeconds = Number(decoded?.exp) || 0;
  const refreshExpiresAt = expSeconds ? new Date(expSeconds * 1000) : new Date(Date.now() + 30 * 86400 * 1000);

  return { accessToken, refreshToken, refreshTokenId: tokenId, refreshExpiresAt };
}

function extractBearerToken(value) {
  if (typeof value !== "string") return "";
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match ? String(match[1] || "").trim() : "";
}

function requireAccessToken(req, res, next) {
  const token = extractBearerToken(req.headers?.authorization);
  if (!token) {
    return res.status(401).json({ error: "missing access token", code: "MISSING_ACCESS_TOKEN" });
  }

  try {
    const payload = jwt.verify(token, config.JWT_ACCESS_SECRET, {
      algorithms: ["HS256"],
      issuer: config.JWT_ISSUER,
      audience: config.JWT_AUDIENCE,
    });

    if (payload?.type !== "access") {
      return res.status(401).json({ error: "invalid token type", code: "INVALID_ACCESS_TOKEN" });
    }

    const subject = typeof payload?.sub === "string" ? payload.sub : "";
    const userId = Number(subject);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({ error: "invalid token subject", code: "INVALID_ACCESS_TOKEN" });
    }

    req.auth = {
      userId,
      username: typeof payload?.username === "string" ? payload.username : "",
    };

    return next();
  } catch (error) {
    if (error?.name === "TokenExpiredError") {
      return res.status(401).json({ error: "access token expired", code: "ACCESS_TOKEN_EXPIRED" });
    }
    if (error?.name === "JsonWebTokenError") {
      return res.status(401).json({ error: "invalid access token", code: "INVALID_ACCESS_TOKEN" });
    }
    return res.status(401).json({ error: "unauthorized", code: "UNAUTHORIZED" });
  }
}

function ensureUserIdConsistency(req, res, next) {
  const authUserId = Number(req.auth?.userId);
  if (!Number.isInteger(authUserId) || authUserId <= 0) {
    return res.status(401).json({ error: "unauthorized", code: "UNAUTHORIZED" });
  }

  const candidates = [];
  if (req.query && Object.prototype.hasOwnProperty.call(req.query, "userId")) {
    candidates.push(Number(req.query.userId));
  }
  if (req.body && typeof req.body === "object" && Object.prototype.hasOwnProperty.call(req.body, "userId")) {
    candidates.push(Number(req.body.userId));
  }

  if (candidates.some((id) => Number.isInteger(id) && id > 0 && id !== authUserId)) {
    return res.status(403).json({ error: "forbidden", code: "USER_MISMATCH" });
  }

  return next();
}

const PUBLIC_API_PATHS = new Set([
  "/api/health",
  "/api/login",
  "/api/register",
  "/api/refresh",
  "/api/logout",
  "/api/push/vapid-public-key",
]);

function setupAuthMiddleware(app) {
  app.use((req, res, next) => {
    if (req.method === "OPTIONS") {
      return next();
    }
    if (!req.path.startsWith("/api/")) {
      return next();
    }
    if (PUBLIC_API_PATHS.has(req.path)) {
      return next();
    }
    return requireAccessToken(req, res, () => ensureUserIdConsistency(req, res, next));
  });
}

module.exports = {
  asyncHandler,
  looksLikeBcryptHash,
  hashPassword,
  verifyPassword,
  normalizeUsername,
  normalizePassword,
  createTokenPair,
  setupAuthMiddleware,
  PUBLIC_API_PATHS,
};
