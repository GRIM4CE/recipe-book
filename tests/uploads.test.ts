import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createDb } from "../src/db.js";
import { createLocalPresigner } from "../src/uploads.js";

let dir: string;
let client: Client;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "recipe-uploads-"));
  client = createClient({ url: `file:${join(dir, "test.db")}` });
  const db = createDb(client);
  await db.applySchema();
  app = createApp({ db, presigner: createLocalPresigner(), localPhotoDir: dir });
});

afterAll(() => {
  client.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("local photo uploads", () => {
  it("presigns, stores, and serves a photo round-trip", async () => {
    const presign = await request(app).post("/api/uploads");
    expect(presign.status).toBe(200);
    expect(presign.body.key).toMatch(/^photos\/[0-9a-f-]{36}\.jpg$/);
    expect(presign.body.uploadUrl).toBe(`/api/uploads/${presign.body.key}`);

    const bytes = Buffer.from("fake-jpeg-bytes");
    const put = await request(app)
      .put(presign.body.uploadUrl)
      .set("Content-Type", "image/jpeg")
      .send(bytes);
    expect(put.status).toBe(201);

    const served = await request(app).get(`/${presign.body.key}`);
    expect(served.status).toBe(200);
    expect(served.headers["content-type"]).toContain("image/jpeg");
    expect(Buffer.from(served.body)).toEqual(bytes);
  });

  it("rejects traversal-ish names", async () => {
    expect(
      (
        await request(app)
          .put("/api/uploads/photos/notauuid.jpg")
          .set("Content-Type", "image/jpeg")
          .send(Buffer.from("x"))
      ).status,
    ).toBe(400);
    expect((await request(app).get("/photos/evil.txt")).status).toBe(400);
  });

  it("404s missing photos", async () => {
    const missing = `${"0".repeat(8)}-0000-0000-0000-${"0".repeat(12)}.jpg`;
    expect((await request(app).get(`/photos/${missing}`)).status).toBe(404);
  });

  it("503s when no presigner is configured", async () => {
    const bare = createApp({ db: createDb(client) });
    expect((await request(bare).post("/api/uploads")).status).toBe(503);
  });
});
