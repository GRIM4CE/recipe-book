import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createDb, type Db } from "../src/db.js";
import { createLocalPresigner } from "../src/uploads.js";

const SECRET = "test-secret";

let dir: string;
let client: Client;
let db: Db;
let app: ReturnType<typeof createApp>;

const auth = { Authorization: `Bearer ${SECRET}` };

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "recipe-external-"));
  client = createClient({ url: `file:${join(dir, "test.db")}` });
  db = createDb(client);
  await db.applySchema();
  await db.createCategory({ name: "Dinner", color: "#E85D4C" });
  app = createApp({
    db,
    externalSecret: SECRET,
    presigner: createLocalPresigner(),
    localPhotoDir: dir,
  });
});

afterAll(() => {
  client.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("external recipe import", () => {
  it("rejects missing and wrong secrets", async () => {
    expect(
      (await request(app).post("/api/external/recipes").send({ title: "X" })).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .post("/api/external/recipes")
          .set("Authorization", "Bearer wrong")
          .send({ title: "X" })
      ).status,
    ).toBe(401);
  });

  it("503s everywhere when no secret is configured", async () => {
    const bare = createApp({ db });
    const res = await request(bare)
      .post("/api/external/recipes")
      .set(auth)
      .send({ title: "X" });
    expect(res.status).toBe(503);
  });

  it("creates an import-sourced recipe with category matched by name", async () => {
    const res = await request(app).post("/api/external/recipes").set(auth).send({
      title: "Pushed Ragù",
      summary: "From the importer.",
      ingredients: ["beef", "tomatoes"],
      instructions: ["Simmer."],
      category: "dinner",
      createdBy: "automation",
    });
    expect(res.status).toBe(201);
    expect(res.body.source).toBe("import");
    expect(res.body.createdBy).toBe("automation");
    expect(res.body.category.name).toBe("Dinner");
  });

  it("drops unknown categories instead of inventing them", async () => {
    const res = await request(app).post("/api/external/recipes").set(auth).send({
      title: "Uncharted Dish",
      category: "Cryptids",
    });
    expect(res.status).toBe(201);
    expect(res.body.category).toBeNull();
    expect((await db.listCategories()).map((c) => c.name)).toEqual(["Dinner"]);
  });

  it("defaults createdBy to importer and validates payloads", async () => {
    const ok = await request(app)
      .post("/api/external/recipes")
      .set(auth)
      .send({ title: "Bare Minimum" });
    expect(ok.body.createdBy).toBe("importer");

    expect(
      (await request(app).post("/api/external/recipes").set(auth).send({})).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post("/api/external/recipes")
          .set(auth)
          .send({ title: "X", ingredients: "not an array" })
      ).status,
    ).toBe(400);
  });

  it("presigns uploads with the secret", async () => {
    expect((await request(app).post("/api/external/uploads")).status).toBe(401);
    const res = await request(app).post("/api/external/uploads").set(auth);
    expect(res.status).toBe(200);
    expect(res.body.key).toMatch(/^photos\/[0-9a-f-]{36}\.jpg$/);
  });
});
