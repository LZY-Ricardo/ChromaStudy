require("dotenv").config({ path: require("path").join(__dirname, ".env") });
const { prisma } = require("./prismaClient");
const bcrypt = require("bcryptjs");

async function testRegister() {
  const username = "test" + Date.now();
  const password = "123456";

  console.log("1. Testing user creation...");
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log("   Password hashed OK");

    const created = await prisma.user.create({
      data: { username, password: hashedPassword },
    });
    console.log("   User created OK:", created.id, created.username);

    console.log("2. Testing refreshToken creation...");
    const tokenId = require("crypto").randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 86400 * 1000);

    const token = await prisma.refreshToken.create({
      data: {
        tokenId,
        userId: created.id,
        expiresAt,
      },
    });
    console.log("   RefreshToken created OK:", token.id);

    console.log("SUCCESS!");
  } catch (error) {
    console.error("ERROR:", error.message);
    console.error("Stack:", error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

testRegister();
