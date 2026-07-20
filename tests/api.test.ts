import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createDb } from "../src/db.js";

let dir: string;
let client: Client;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "recipe-api-"));
  client = createClient({ url: `file:${join(dir, "test.db")}` });
  const db = createDb(client);
  await db.applySchema();
  app = createApp({ db });
});

afterAll(() => {
  client.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("healthz", () => {
  it("responds ok", async () => {
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

describe("recipes", () => {
  it("creates with dev-bypass attribution and lists", async () => {
    const created = await request(app).post("/api/recipes").send({
      title: "Pancakes",
      summary: "Fluffy.",
      ingredients: ["flour", "eggs"],
      instructions: ["mix", "fry"],
    });
    expect(created.status).toBe(201);
    expect(created.body.createdBy).toBe("dev");
    expect(created.body.source).toBe("web");
    expect(created.body.photoUrl).toBeNull();

    const list = await request(app).get("/api/recipes");
    expect(list.status).toBe(200);
    expect(list.body.recipes.some((r: { title: string }) => r.title === "Pancakes")).toBe(
      true,
    );
  });

  it("saves tags, deduping and trimming them", async () => {
    const created = await request(app).post("/api/recipes").send({
      title: "Buffalo Wings",
      tags: ["Wing Sauces", " wing sauces ", "Grill Out", ""],
    });
    expect(created.status).toBe(201);
    expect(created.body.tags).toEqual(["Grill Out", "Wing Sauces"]);

    const updated = await request(app)
      .put(`/api/recipes/${created.body.id}`)
      .send({ title: "Buffalo Wings", tags: ["Party Food"] });
    expect(updated.body.tags).toEqual(["Party Food"]);
  });

  it("rejects invalid payloads", async () => {
    expect((await request(app).post("/api/recipes").send({})).status).toBe(400);
    expect(
      (
        await request(app)
          .post("/api/recipes")
          .send({ title: "X", tags: [1] })
      ).status,
    ).toBe(400);
    expect(
      (await request(app).post("/api/recipes").send({ title: "  " })).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post("/api/recipes")
          .send({ title: "X", ingredients: [1, 2] })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post("/api/recipes")
          .send({ title: "X", categoryId: 999 })
      ).status,
    ).toBe(400);
  });

  it("updates and deletes", async () => {
    const created = await request(app)
      .post("/api/recipes")
      .send({ title: "Toast" });
    const id = created.body.id;

    const updated = await request(app)
      .put(`/api/recipes/${id}`)
      .send({ title: "French Toast", ingredients: ["bread", "eggs"] });
    expect(updated.status).toBe(200);
    expect(updated.body.title).toBe("French Toast");

    expect((await request(app).delete(`/api/recipes/${id}`)).status).toBe(204);
    expect((await request(app).get(`/api/recipes/${id}`)).status).toBe(404);
    expect((await request(app).put(`/api/recipes/${id}`).send({ title: "x" })).status).toBe(
      404,
    );
    expect((await request(app).delete(`/api/recipes/${id}`)).status).toBe(404);
  });
});

describe("categories", () => {
  it("creates, rejects duplicates and bad colors", async () => {
    const created = await request(app)
      .post("/api/categories")
      .send({ name: "Dinner", color: "#E85D4C" });
    expect(created.status).toBe(201);

    expect(
      (
        await request(app)
          .post("/api/categories")
          .send({ name: "dinner", color: "#111111" })
      ).status,
    ).toBe(409);
    expect(
      (
        await request(app)
          .post("/api/categories")
          .send({ name: "Sides", color: "red" })
      ).status,
    ).toBe(400);
  });

  it("blocks deletion while recipes reference it", async () => {
    const cat = await request(app)
      .post("/api/categories")
      .send({ name: "Dessert", color: "#E8618C" });
    const recipe = await request(app)
      .post("/api/recipes")
      .send({ title: "Cookies", categoryId: cat.body.id });
    expect(recipe.body.category.name).toBe("Dessert");

    expect((await request(app).delete(`/api/categories/${cat.body.id}`)).status).toBe(
      409,
    );
    await request(app).delete(`/api/recipes/${recipe.body.id}`);
    expect((await request(app).delete(`/api/categories/${cat.body.id}`)).status).toBe(
      204,
    );
    expect((await request(app).delete(`/api/categories/${cat.body.id}`)).status).toBe(
      404,
    );
  });
});

describe("cors", () => {
  it("answers preflight for the dev origin", async () => {
    const res = await request(app)
      .options("/api/recipes")
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "POST");
    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(res.headers["access-control-allow-headers"]).toContain("Authorization");
  });

  it("does not reflect unknown origins", async () => {
    const res = await request(app)
      .get("/api/recipes")
      .set("Origin", "https://evil.example");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
