import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { TokenVerifier } from "../src/auth.js";
import { createDb, type Db } from "../src/db.js";

const stubVerifier: TokenVerifier = {
  async verify(token) {
    if (token !== "good-token") throw new Error("bad token");
    return { username: "alice" };
  },
};

let dir: string;
let client: Client;
let db: Db;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "recipe-auth-"));
  client = createClient({ url: `file:${join(dir, "test.db")}` });
  db = createDb(client);
  await db.applySchema();
});

afterAll(() => {
  client.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("write auth with a verifier", () => {
  it("rejects missing and invalid tokens, keeps reads public", async () => {
    const app = createApp({ db, verifier: stubVerifier });

    expect((await request(app).get("/api/recipes")).status).toBe(200);

    const noToken = await request(app).post("/api/recipes").send({ title: "X" });
    expect(noToken.status).toBe(401);

    const badToken = await request(app)
      .post("/api/recipes")
      .set("Authorization", "Bearer nope")
      .send({ title: "X" });
    expect(badToken.status).toBe(401);
  });

  it("attributes writes to the verified username", async () => {
    const app = createApp({ db, verifier: stubVerifier });
    const res = await request(app)
      .post("/api/recipes")
      .set("Authorization", "Bearer good-token")
      .send({ title: "Alice's Soup" });
    expect(res.status).toBe(201);
    expect(res.body.createdBy).toBe("alice");
  });
});

describe("write auth without a verifier", () => {
  it("refuses writes in production instead of bypassing", async () => {
    const app = createApp({ db, isProduction: true });
    const res = await request(app).post("/api/recipes").send({ title: "X" });
    expect(res.status).toBe(401);
  });

  it("runs as dev locally", async () => {
    const app = createApp({ db });
    const res = await request(app).post("/api/recipes").send({ title: "Y" });
    expect(res.status).toBe(201);
    expect(res.body.createdBy).toBe("dev");
  });
});
