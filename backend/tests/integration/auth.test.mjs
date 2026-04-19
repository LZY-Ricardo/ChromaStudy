import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { startServer, stopServer } = require("../helpers/createApp");

describe("Auth endpoints", () => {
  let server;
  let testUser;

  beforeAll(async () => {
    server = await startServer();
  });

  afterAll(async () => {
    // cleanup
    if (testUser) {
      const { prisma } = require("../../prismaClient");
      try {
        await prisma.refreshToken.deleteMany({ where: { userId: testUser.id } });
        await prisma.studyLog.deleteMany({ where: { userId: testUser.id } });
        await prisma.task.deleteMany({ where: { userId: testUser.id } });
        await prisma.user.delete({ where: { id: testUser.id } });
      } catch {}
    }
    await stopServer();
  });

  describe("POST /api/register", () => {
    it("creates a new user and returns tokens", async () => {
      const res = await request(server)
        .post("/api/register")
        .send({ username: "testuser_auth", password: "password123" });

      expect(res.status).toBe(201);
      expect(res.body.user.username).toBe("testuser_auth");
      expect(res.body.accessToken).toBeTruthy();
      expect(res.body.refreshToken).toBeTruthy();

      testUser = res.body.user;
    });

    it("rejects duplicate username", async () => {
      const res = await request(server)
        .post("/api/register")
        .send({ username: "testuser_auth", password: "password123" });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain("already exists");
    });

    it("rejects short password", async () => {
      const res = await request(server)
        .post("/api/register")
        .send({ username: "newuser_short", password: "123" });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("at least 6");
    });

    it("rejects missing fields", async () => {
      const res = await request(server)
        .post("/api/register")
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/login", () => {
    it("returns tokens for valid credentials", async () => {
      const res = await request(server)
        .post("/api/login")
        .send({ username: "testuser_auth", password: "password123" });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeTruthy();
      expect(res.body.refreshToken).toBeTruthy();
    });

    it("rejects invalid credentials", async () => {
      const res = await request(server)
        .post("/api/login")
        .send({ username: "testuser_auth", password: "wrongpassword" });

      expect(res.status).toBe(401);
    });

    it("rejects non-existent user", async () => {
      const res = await request(server)
        .post("/api/login")
        .send({ username: "nonexistent", password: "password123" });

      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/me", () => {
    it("returns user info with valid token", async () => {
      const loginRes = await request(server)
        .post("/api/login")
        .send({ username: "testuser_auth", password: "password123" });

      const res = await request(server)
        .get("/api/me")
        .set("Authorization", `Bearer ${loginRes.body.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.user.username).toBe("testuser_auth");
    });

    it("rejects request without token", async () => {
      const res = await request(server).get("/api/me");
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/logout", () => {
    it("returns ok for valid token", async () => {
      const res = await request(server)
        .post("/api/logout")
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });
});
