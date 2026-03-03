require("dotenv").config({ path: require("path").join(__dirname, ".env") });
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const JWT_ISSUER = process.env.JWT_ISSUER || "chroma-study";
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || "chroma-study-api";
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "dev-access-secret-change-me";
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "dev-refresh-secret-change-me";
const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || "15m";
const REFRESH_TOKEN_TTL = process.env.REFRESH_TOKEN_TTL || "30d";

function generateTokenId() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return crypto.randomBytes(16).toString("hex");
}

function signAccessToken(user) {
  return jwt.sign(
    { type: "access", username: user.username },
    JWT_ACCESS_SECRET,
    {
      algorithm: "HS256",
      expiresIn: ACCESS_TOKEN_TTL,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      subject: String(user.id),
    }
  );
}

function signRefreshToken(user, tokenId) {
  return jwt.sign({ type: "refresh" }, JWT_REFRESH_SECRET, {
    algorithm: "HS256",
    expiresIn: REFRESH_TOKEN_TTL,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
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

try {
  console.log("JWT_ACCESS_SECRET:", JWT_ACCESS_SECRET);
  console.log("JWT_REFRESH_SECRET:", JWT_REFRESH_SECRET);

  const user = { id: 1, username: "test" };
  console.log("\nCreating tokens for user:", user);

  const tokens = createTokenPair(user);
  console.log("Access token:", tokens.accessToken.substring(0, 50) + "...");
  console.log("Refresh token:", tokens.refreshToken.substring(0, 50) + "...");
  console.log("Token ID:", tokens.refreshTokenId);
  console.log("Expires at:", tokens.refreshExpiresAt);

  console.log("\nSUCCESS!");
} catch (error) {
  console.error("ERROR:", error.message);
  console.error("Stack:", error.stack);
}
