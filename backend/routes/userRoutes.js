const { Router } = require("express");
const { prisma } = require("../prismaClient");
const { asyncHandler } = require("../middleware/auth");

const router = Router();

router.get(
  "/me",
  asyncHandler(async (req, res) => {
    const userId = Number(req.auth?.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({ error: "unauthorized", code: "UNAUTHORIZED" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true },
    });

    if (!user) {
      return res.status(404).json({ error: "user not found" });
    }

    return res.json({ user });
  })
);

module.exports = router;
