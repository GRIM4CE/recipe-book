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
      servings: "4",
      notes: "Best with real maple syrup.",
      ingredients: ["flour", "eggs"],
      instructions: ["mix", "fry"],
    });
    expect(created.status).toBe(201);
    expect(created.body.servings).toBe("4");
    expect(created.body.notes).toBe("Best with real maple syrup.");
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
          .send({ title: "X", servings: 4 })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post("/api/recipes")
          .send({ title: "X", notes: 5 })
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
      .send({
        title: "French Toast",
        servings: "2",
        notes: "Use day-old bread.",
        ingredients: ["bread", "eggs"],
      });
    expect(updated.status).toBe(200);
    expect(updated.body.title).toBe("French Toast");
    expect(updated.body.servings).toBe("2");
    expect(updated.body.notes).toBe("Use day-old bread.");

    expect((await request(app).delete(`/api/recipes/${id}`)).status).toBe(204);
    expect((await request(app).get(`/api/recipes/${id}`)).status).toBe(404);
    expect((await request(app).put(`/api/recipes/${id}`).send({ title: "x" })).status).toBe(
      404,
    );
    expect((await request(app).delete(`/api/recipes/${id}`)).status).toBe(404);
  });

  it("keeps titles unique, case-insensitively", async () => {
    const created = await request(app).post("/api/recipes").send({ title: "Risotto" });
    expect(created.status).toBe(201);

    const clash = await request(app).post("/api/recipes").send({ title: "risotto" });
    expect(clash.status).toBe(409);

    const other = await request(app).post("/api/recipes").send({ title: "Polenta" });
    expect(
      (await request(app).put(`/api/recipes/${other.body.id}`).send({ title: "RISOTTO" }))
        .status,
    ).toBe(409);

    // Saving a recipe under the title it already holds is not a clash.
    const resaved = await request(app)
      .put(`/api/recipes/${created.body.id}`)
      .send({ title: "Risotto", servings: "2" });
    expect(resaved.status).toBe(200);
    expect(resaved.body.servings).toBe("2");
  });

  it("duplicates a recipe under its own name", async () => {
    const cat = await request(app)
      .post("/api/categories")
      .send({ name: "Suppers", color: "#4C9BE8" });
    const created = await request(app).post("/api/recipes").send({
      title: "Congee",
      summary: "Slow rice.",
      servings: "4",
      notes: "Ginger on top.",
      ingredients: ["rice", "stock"],
      instructions: ["simmer"],
      tags: ["Comfort"],
      categoryId: cat.body.id,
    });

    const copy = await request(app).post(`/api/recipes/${created.body.id}/duplicate`);
    expect(copy.status).toBe(201);
    expect(copy.body.id).not.toBe(created.body.id);
    expect(copy.body.title).toBe("Congee (copy)");
    expect(copy.body.summary).toBe("Slow rice.");
    expect(copy.body.servings).toBe("4");
    expect(copy.body.notes).toBe("Ginger on top.");
    expect(copy.body.ingredients).toEqual(["rice", "stock"]);
    expect(copy.body.instructions).toEqual(["simmer"]);
    expect(copy.body.tags).toEqual(["Comfort"]);
    expect(copy.body.category.id).toBe(cat.body.id);

    // A second copy steps past the name the first one took.
    const again = await request(app).post(`/api/recipes/${created.body.id}/duplicate`);
    expect(again.body.title).toBe("Congee (copy 2)");
    // As does a copy of the copy.
    const nested = await request(app).post(`/api/recipes/${copy.body.id}/duplicate`);
    expect(nested.body.title).toBe("Congee (copy) (copy)");

    expect((await request(app).post("/api/recipes/999999/duplicate")).status).toBe(404);
  });
});

describe("schema migration", () => {
  it("adds the servings and notes columns to a database created before they existed", async () => {
    const old = createClient({ url: `file:${join(dir, "old.db")}` });
    await old.execute(`CREATE TABLE recipes (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      ingredients TEXT NOT NULL DEFAULT '[]',
      instructions TEXT NOT NULL DEFAULT '[]',
      category_id INTEGER,
      photo_key TEXT,
      created_by TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'web',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
    const oldDb = createDb(old);
    await oldDb.applySchema();
    const recipe = await oldDb.createRecipe(
      { title: "Old", servings: "3", notes: "Grandma's version." },
      { createdBy: "dev", source: "web" },
    );
    expect(recipe.servings).toBe("3");
    expect(recipe.notes).toBe("Grandma's version.");
    old.close();
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

describe("tags", () => {
  it("lists, renames, and deletes tags", async () => {
    await request(app)
      .post("/api/recipes")
      .send({ title: "Tagged Dish", tags: ["Spicy", "Quick"] });

    const list = await request(app).get("/api/tags");
    expect(list.status).toBe(200);
    const spicy = list.body.tags.find((t: { name: string }) => t.name === "Spicy");
    expect(spicy.count).toBe(1);

    const renamed = await request(app)
      .put(`/api/tags/${spicy.id}`)
      .send({ name: "Fiery" });
    expect(renamed.status).toBe(200);
    expect(renamed.body.tags.some((t: { name: string }) => t.name === "Fiery")).toBe(
      true,
    );

    const quick = list.body.tags.find((t: { name: string }) => t.name === "Quick");
    expect((await request(app).delete(`/api/tags/${quick.id}`)).status).toBe(204);
    const after = await request(app).get("/api/tags");
    expect(after.body.tags.some((t: { name: string }) => t.name === "Quick")).toBe(
      false,
    );
  });

  it("rejects a blank rename and 404s a missing tag", async () => {
    expect((await request(app).put("/api/tags/1").send({ name: "  " })).status).toBe(
      400,
    );
    expect(
      (await request(app).put("/api/tags/99999").send({ name: "Ghost" })).status,
    ).toBe(404);
    expect((await request(app).delete("/api/tags/99999")).status).toBe(404);
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
