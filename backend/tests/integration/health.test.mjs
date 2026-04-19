import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { startServer, stopServer } = require("../helpers/createApp");

describe("GET /api/health", () => {
  let server;

  beforeAll(async () => {
    server = await startServer();
  });

  afterAll(async () => {
    await stopServer();
  });

  it("returns ok: true", async () => {
    const res = await request(server).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
