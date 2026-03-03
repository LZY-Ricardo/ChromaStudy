require("dotenv").config({ path: require("path").join(__dirname, ".env") });
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { prisma } = require("./prismaClient");

const JWT_ISSUER = process.env.JWT_ISSUER || "chroma-study";
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || "chroma-study-api";
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "dev-access-secret-change-me";
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "dev-refresh-secret-change-me";
const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || "15m";
const REFRESH_TOKEN_TTL = process.env.REFRESH_TOKEN_TTL || "30d";
const BCRYPT_COST = Number(process.env.BCRYPT_COST) || 10;

function normalizeUsername(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePassword(value) {
  return typeof value === "string" ? value : "";
}

async function hashPassword(password) {
  return bcrypt.hash(String(password), BCRYPT_COST);
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

async function register(username, password) {
  console.log("1. Normalizing inputs...");
  const normalizedUsername = normalizeUsername(username);
  const normalizedPassword = normalizePassword(password);
  console.log("   Username:", normalizedUsername);
  console.log("   Password length:", normalizedPassword.length);

  if (!normalizedUsername || !normalizedPassword) {
    throw new Error("username and password are required");
  }

  console.log("2. Checking existing user...");
  const existing = await prisma.user.findUnique({ where: { username: normalizedUsername } });
  if (existing) {
    throw new Error("username already exists");
  }

  console.log("3. Hashing password...");
  const hashedPassword = await hashPassword(normalizedPassword);

  console.log("4. Creating user...");
  const created = await prisma.user.create({
    data: { username: normalizedUsername, password: hashedPassword },
  });
  console.log("   User created:", created.id, created.username);

  const user = { id: created.id, username: created.username };

  console.log("5. Creating tokens...");
  const tokens = createTokenPair(user);
  console.log("   Tokens created");

  console.log("6. Creating refresh token in DB...");
  const tokenRecord = await prisma.refreshToken.create({
    data: {
      tokenId: tokens.refreshTokenId,
      userId: user.id,
      expiresAt: tokens.refreshExpiresAt,
    },
  });
  console.log("   RefreshToken created:", tokenRecord.id);

  return {
    user,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  };
}

async function main() {
  const username = "testfull" + Date.now();
  const password = "123456";

  console.log("=== Testing Full Registration Flow ===");
  console.log("Username:", username);
  console.log("Password:", password);
  console.log();

  try {
    const result = await register(username, password);
    console.log();
    console.log("=== SUCCESS ===");
    console.log("User:", result.user);
    console.log("AccessToken (first 50 chars):", result.accessToken.substring(0, 50) + "...");
    console.log("RefreshToken (first 50 chars):", result.refreshToken.substring(0, 50) + "...");
  } catch (error) {
    console.log();
    console.log("=== FAILED ===");
    console.log("Error:", error.message);
    console.log("Stack:", error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

main();
