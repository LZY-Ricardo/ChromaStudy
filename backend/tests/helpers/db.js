const { prisma } = require("../../prismaClient");

const TEST_PREFIX = "__test_";
const createdIds = [];

async function createTestUser(overrides = {}) {
  const username = (overrides.username || TEST_PREFIX + Date.now()) + Math.random().toString(36).slice(2, 6);
  const user = await prisma.user.create({
    data: {
      username,
      password: "$2a$10$testhashfortestonly",
      ...overrides,
    },
  });
  createdIds.push({ model: "user", id: user.id });
  return user;
}

async function getAuthHeaders(user) {
  const { createTokenPair } = require("../../middleware/auth");
  const tokens = createTokenPair(user);
  return {
    Authorization: `Bearer ${tokens.accessToken}`,
    "Content-Type": "application/json",
  };
}

async function cleanupTestUsers() {
  for (const item of createdIds) {
    try {
      if (item.model === "user") {
        await prisma.refreshToken.deleteMany({ where: { userId: item.id } });
        await prisma.studyLog.deleteMany({ where: { userId: item.id } });
        await prisma.task.deleteMany({ where: { userId: item.id } });
        await prisma.user.delete({ where: { id: item.id } });
      }
    } catch (error) {
      console.error("Cleanup error:", error.message);
    }
  }
  createdIds.length = 0;
}

module.exports = { createTestUser, getAuthHeaders, cleanupTestUsers };
