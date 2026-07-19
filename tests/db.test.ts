import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../src/db.js";

let dir: string;
let client: Client;
let db: Db;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "recipe-db-"));
  client = createClient({ url: `file:${join(dir, "test.db")}` });
  db = createDb(client);
  await db.applySchema();
});

afterAll(() => {
  client.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("categories", () => {
  it("creates, lists, updates", async () => {
    const created = await db.createCategory({ name: "Dinner", color: "#E85D4C" });
    expect(created.id).toBeGreaterThan(0);

    const listed = await db.listCategories();
    expect(listed.map((c) => c.name)).toContain("Dinner");

    const updated = await db.updateCategory(created.id, {
      name: "Dinners",
      color: "#111111",
    });
    expect(updated?.name).toBe("Dinners");
  });

  it("matches names case-insensitively", async () => {
    await db.createCategory({ name: "Drinks", color: "#4C9BE8" });
    const found = await db.getCategoryByName("drinks");
    expect(found?.name).toBe("Drinks");
  });

  it("refuses to delete a category still referenced by recipes", async () => {
    const cat = await db.createCategory({ name: "Dessert", color: "#E8618C" });
    const recipe = await db.createRecipe(
      { title: "Cookies", categoryId: cat.id },
      { createdBy: "dev", source: "web" },
    );
    expect(await db.deleteCategory(cat.id)).toBe("in_use");

    await db.deleteRecipe(recipe.id);
    expect(await db.deleteCategory(cat.id)).toBe("deleted");
    expect(await db.deleteCategory(cat.id)).toBe("missing");
  });
});

describe("recipes", () => {
  it("round-trips ingredients and instructions as arrays", async () => {
    const cat = await db.createCategory({ name: "Breakfast", color: "#F2A93B" });
    const created = await db.createRecipe(
      {
        title: "Pancakes",
        summary: "Fluffy.",
        ingredients: ["2 cups flour", "2 eggs"],
        instructions: ["Mix.", "Fry."],
        categoryId: cat.id,
      },
      { createdBy: "dev", source: "web" },
    );

    expect(created.ingredients).toEqual(["2 cups flour", "2 eggs"]);
    expect(created.instructions).toEqual(["Mix.", "Fry."]);
    expect(created.category?.name).toBe("Breakfast");
    expect(created.createdBy).toBe("dev");
    expect(created.source).toBe("web");

    const fetched = await db.getRecipe(created.id);
    expect(fetched).toEqual(created);
  });

  it("embeds a null category when unset and lists newest first", async () => {
    const uncategorized = await db.createRecipe(
      { title: "Mystery Stew" },
      { createdBy: "importer", source: "import" },
    );
    expect(uncategorized.category).toBeNull();
    expect(uncategorized.source).toBe("import");

    const all = await db.listRecipes();
    expect(all.some((r) => r.id === uncategorized.id)).toBe(true);
  });

  it("updates in place and hard-deletes", async () => {
    const created = await db.createRecipe(
      { title: "Toast", ingredients: ["bread"] },
      { createdBy: "dev", source: "web" },
    );
    const updated = await db.updateRecipe(created.id, {
      title: "French Toast",
      ingredients: ["bread", "eggs"],
    });
    expect(updated?.title).toBe("French Toast");
    expect(updated?.ingredients).toEqual(["bread", "eggs"]);
    expect(updated?.updatedAt >= created.updatedAt).toBe(true);

    expect(await db.deleteRecipe(created.id)).toBe(true);
    expect(await db.deleteRecipe(created.id)).toBe(false);
    expect(await db.getRecipe(created.id)).toBeNull();
  });

  it("returns null when updating a missing recipe", async () => {
    expect(await db.updateRecipe(99_999, { title: "Ghost" })).toBeNull();
  });
});
