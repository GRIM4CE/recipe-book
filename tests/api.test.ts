import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { TokenVerifier } from "../src/auth.js";
import { createDb, type Db } from "../src/db.js";
import type { TranslatableFields, Translator } from "../src/translate.js";
import type { UserAccount, UserDirectory } from "../src/users.js";

// Prefixes every string with the target language so tests can see what was
// translated; records calls, and throws when told to.
function stubTranslator() {
  const calls: { from: string; to: string; recipe: TranslatableFields }[] = [];
  const state = { fail: false };
  const mark = (to: string, s: string) => (s ? `[${to}] ${s}` : s);
  const translator: Translator = {
    async translate({ from, to, recipe }) {
      calls.push({ from, to, recipe });
      if (state.fail) throw new Error("boom");
      return {
        title: mark(to, recipe.title),
        summary: mark(to, recipe.summary),
        servings: mark(to, recipe.servings),
        ingredients: recipe.ingredients.map((i) => mark(to, i)),
        instructions: recipe.instructions.map((i) => mark(to, i)),
        notes: mark(to, recipe.notes),
      };
    },
  };
  return { translator, calls, state };
}

const stubAccounts: UserAccount[] = [
  {
    username: "alice",
    email: "alice@example.com",
    displayName: "Alice",
    createdAt: "2026-01-01T00:00:00.000Z",
    enabled: true,
    status: "CONFIRMED",
  },
  {
    username: "cousin@example.com",
    email: null,
    displayName: null,
    createdAt: "2026-02-01T00:00:00.000Z",
    enabled: false,
    status: "FORCE_CHANGE_PASSWORD",
  },
];

// Records invites and chosen names instead of calling Cognito; answers
// "exists" or "taken" when told to, and reports state.displayName as the
// signed-in person's chosen name.
function stubDirectory() {
  const calls: { username: string; email: string }[] = [];
  const nameCalls: { username: string; displayName: string }[] = [];
  const state = { exists: false, taken: false, displayName: null as string | null };
  const directory: UserDirectory = {
    async invite(input) {
      calls.push(input);
      return state.exists ? "exists" : "created";
    },
    async getProfile() {
      return { displayName: state.displayName };
    },
    async setDisplayName(username, displayName) {
      nameCalls.push({ username, displayName });
      return state.taken ? "taken" : "set";
    },
    async list() {
      return stubAccounts;
    },
  };
  return { directory, calls, nameCalls, state };
}

// "<name>-token" signs in as <name>, so a test picks who is calling.
const namedVerifier: TokenVerifier = {
  async verify(token) {
    if (!token.endsWith("-token")) throw new Error("bad token");
    return { username: token.slice(0, -"-token".length) };
  },
};

let dir: string;
let client: Client;
let db: Db;
let app: ReturnType<typeof createApp>;
let translating: ReturnType<typeof stubTranslator>;
let translateApp: ReturnType<typeof createApp>;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "recipe-api-"));
  client = createClient({ url: `file:${join(dir, "test.db")}` });
  db = createDb(client);
  await db.applySchema();
  app = createApp({ db });
  translating = stubTranslator();
  translateApp = createApp({ db, translator: translating.translator });
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

  it("stores the recipe's language, defaulting to en", async () => {
    const french = await request(app)
      .post("/api/recipes")
      .send({ title: "Crêpes", language: "fr" });
    expect(french.status).toBe(201);
    expect(french.body.language).toBe("fr");
    expect(french.body.translations).toEqual({});

    const plain = await request(app).post("/api/recipes").send({ title: "Crumpets" });
    expect(plain.body.language).toBe("en");

    const switched = await request(app)
      .put(`/api/recipes/${plain.body.id}`)
      .send({ title: "Crumpets", language: "fr" });
    expect(switched.body.language).toBe("fr");
    const back = await request(app)
      .put(`/api/recipes/${plain.body.id}`)
      .send({ title: "Crumpets", language: "en" });
    expect(back.body.language).toBe("en");
  });

  it("keeps the language when an edit doesn't mention it", async () => {
    const created = await request(app)
      .post("/api/recipes")
      .send({ title: "Blanquette", language: "fr" });
    const edited = await request(app)
      .put(`/api/recipes/${created.body.id}`)
      .send({ title: "Blanquette", servings: "6" });
    expect(edited.status).toBe(200);
    expect(edited.body.language).toBe("fr");
    expect((await request(app).get(`/api/recipes/${created.body.id}`)).body.language).toBe(
      "fr",
    );

    const switched = await request(app)
      .put(`/api/recipes/${created.body.id}`)
      .send({ title: "Blanquette", language: "en" });
    expect(switched.body.language).toBe("en");
  });

  it("rejects an unknown language", async () => {
    for (const language of ["de", "", 1, null]) {
      const res = await request(app)
        .post("/api/recipes")
        .send({ title: "Strudel", language });
      expect(res.status, JSON.stringify(language)).toBe(400);
      expect(res.body.error).toBe("language must be en or fr");
    }
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

describe("translations", () => {
  const createFrench = async (title: string) =>
    (
      await request(translateApp).post("/api/recipes").send({
        title,
        summary: "Légères.",
        servings: "4",
        ingredients: ["2 c. à soupe de sucre", "2 oeufs"],
        instructions: ["Mélanger.", "Cuire."],
        notes: "Servir chaud.",
        language: "fr",
      })
    ).body;

  it("503s when no translator is configured", async () => {
    const recipe = await request(app).post("/api/recipes").send({ title: "Untranslatable" });
    const res = await request(app).post(`/api/recipes/${recipe.body.id}/translate`);
    expect(res.status).toBe(503);
    expect(res.body.error).toBe("translation is not configured");
  });

  it("404s a missing recipe", async () => {
    const res = await request(translateApp).post("/api/recipes/999999/translate");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("recipe not found");
  });

  it("translates a French recipe into English only", async () => {
    const recipe = await createFrench("Crêpes Suzette");
    translating.calls.length = 0;

    const res = await request(translateApp).post(`/api/recipes/${recipe.id}/translate`);
    expect(res.status).toBe(200);
    expect(res.body.language).toBe("fr");
    expect(res.body.title).toBe("Crêpes Suzette");
    expect(Object.keys(res.body.translations)).toEqual(["en"]);
    expect(res.body.translations.en).toEqual({
      title: "[en] Crêpes Suzette",
      summary: "[en] Légères.",
      servings: "[en] 4",
      ingredients: ["[en] 2 c. à soupe de sucre", "[en] 2 oeufs"],
      instructions: ["[en] Mélanger.", "[en] Cuire."],
      notes: "[en] Servir chaud.",
      stale: false,
    });
    expect(translating.calls).toHaveLength(1);
    expect(translating.calls[0]).toMatchObject({ from: "fr", to: "en" });

    const fetched = await request(app).get(`/api/recipes/${recipe.id}`);
    expect(fetched.body.translations.en.stale).toBe(false);
  });

  it("marks a translation stale after an edit, and fresh again once re-translated", async () => {
    const recipe = await createFrench("Gaufres");
    await request(translateApp).post(`/api/recipes/${recipe.id}/translate`);

    const edited = await request(app)
      .put(`/api/recipes/${recipe.id}`)
      .send({ title: "Gaufres", language: "fr", ingredients: ["farine"] });
    expect(edited.status).toBe(200);
    expect(edited.body.translations.en.stale).toBe(true);
    // The old translation is kept, just flagged.
    expect(edited.body.translations.en.ingredients).toEqual([
      "[en] 2 c. à soupe de sucre",
      "[en] 2 oeufs",
    ]);
    const stale = await request(app).get(`/api/recipes/${recipe.id}`);
    expect(stale.body.translations.en.stale).toBe(true);

    const again = await request(translateApp).post(`/api/recipes/${recipe.id}/translate`);
    expect(again.status).toBe(200);
    expect(again.body.translations.en.stale).toBe(false);
    expect(again.body.translations.en.ingredients).toEqual(["[en] farine"]);
    expect(Object.keys(again.body.translations)).toEqual(["en"]);
  });

  it("carries translations on the list endpoint", async () => {
    const recipe = await createFrench("Madeleines");
    await request(translateApp).post(`/api/recipes/${recipe.id}/translate`);
    const plain = await request(app).post("/api/recipes").send({ title: "Scones" });

    const list = await request(app).get("/api/recipes");
    const byId = new Map<number, { translations: Record<string, { title: string }> }>(
      list.body.recipes.map((r: { id: number }) => [r.id, r]),
    );
    expect(byId.get(recipe.id)?.translations.en.title).toBe("[en] Madeleines");
    expect(byId.get(plain.body.id)?.translations).toEqual({});
  });

  it("502s when the translator throws, storing nothing", async () => {
    const recipe = await createFrench("Clafoutis");
    translating.state.fail = true;
    const res = await request(translateApp).post(`/api/recipes/${recipe.id}/translate`);
    translating.state.fail = false;
    expect(res.status).toBe(502);
    expect(res.body.error).toBe("translation failed");
    expect((await request(app).get(`/api/recipes/${recipe.id}`)).body.translations).toEqual(
      {},
    );
  });

  it("doesn't copy translations when duplicating, but keeps the language", async () => {
    const recipe = await createFrench("Quiche");
    await request(translateApp).post(`/api/recipes/${recipe.id}/translate`);

    const copy = await request(app).post(`/api/recipes/${recipe.id}/duplicate`);
    expect(copy.status).toBe(201);
    expect(copy.body.language).toBe("fr");
    expect(copy.body.translations).toEqual({});
  });

  it("removes translations when the recipe is deleted", async () => {
    const recipe = await createFrench("Tarte Tatin");
    await request(translateApp).post(`/api/recipes/${recipe.id}/translate`);
    expect((await request(app).delete(`/api/recipes/${recipe.id}`)).status).toBe(204);

    const left = await client.execute({
      sql: "SELECT COUNT(*) AS n FROM recipe_translations WHERE recipe_id = ?",
      args: [recipe.id],
    });
    expect(Number(left.rows[0].n)).toBe(0);

    const recreated = await createFrench("Tarte Tatin");
    expect(recreated.translations).toEqual({});
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

  it("adds the language column to a database created before it existed", async () => {
    const old = createClient({ url: `file:${join(dir, "no-language.db")}` });
    await old.execute(`CREATE TABLE recipes (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      servings TEXT NOT NULL DEFAULT '',
      ingredients TEXT NOT NULL DEFAULT '[]',
      instructions TEXT NOT NULL DEFAULT '[]',
      notes TEXT NOT NULL DEFAULT '',
      category_id INTEGER,
      photo_key TEXT,
      created_by TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'web',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
    await old.execute(
      `INSERT INTO recipes (title, created_by, created_at, updated_at)
       VALUES ('Before', 'dev', 'then', 'then')`,
    );
    const oldDb = createDb(old);
    await oldDb.applySchema();
    // Existing rows read as English; new ones can be French.
    expect((await oldDb.listRecipes())[0].language).toBe("en");
    const fr = await oldDb.createRecipe(
      { title: "Après", language: "fr" },
      { createdBy: "dev", source: "web" },
    );
    expect(fr.language).toBe("fr");
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

describe("invites", () => {
  const inviteApp = (directory: UserDirectory | null) =>
    createApp({
      db,
      verifier: namedVerifier,
      directory,
      adminUsernames: ["alice"],
    });
  const post = (a: ReturnType<typeof createApp>, as: string, body: object) =>
    request(a).post("/api/users").set("Authorization", `Bearer ${as}-token`).send(body);
  const valid = { email: "cousin@example.com" };

  it("reports who is signed in and whether they can invite", async () => {
    const a = inviteApp(null);
    const admin = await request(a).get("/api/me").set("Authorization", "Bearer alice-token");
    expect(admin.body).toEqual({
      username: "alice",
      displayName: "alice",
      canInvite: true,
      needsUsername: false,
    });
    const other = await request(a).get("/api/me").set("Authorization", "Bearer bob-token");
    expect(other.body).toEqual({
      username: "bob",
      displayName: "bob",
      canInvite: false,
      needsUsername: false,
    });
    expect((await request(a).get("/api/me")).status).toBe(401);
  });

  it("turns away a non-admin even when invites are configured", async () => {
    const { directory, calls } = stubDirectory();
    const res = await post(inviteApp(directory), "bob", valid);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("only an admin can invite");
    expect(calls).toEqual([]);
  });

  it("503s for an admin when no directory is configured", async () => {
    const res = await post(inviteApp(null), "alice", valid);
    expect(res.status).toBe(503);
    expect(res.body.error).toBe("invites are not configured");
  });

  it("rejects a missing or invalid email", async () => {
    const { directory, calls } = stubDirectory();
    const a = inviteApp(directory);
    const bodies: object[] = [
      {},
      { username: "cousin" },
      { email: 5 },
      { email: "not-an-email" },
      { email: "a b@example.com" },
      { email: "   " },
    ];
    for (const body of bodies) {
      const res = await post(a, "alice", body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error).toBe("email must be a valid address");
    }
    expect(calls).toEqual([]);
  });

  it("uses the email as the username and answers 201", async () => {
    const { directory, calls } = stubDirectory();
    const res = await post(inviteApp(directory), "alice", valid);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ username: "cousin@example.com", email: "cousin@example.com" });
    expect(calls).toEqual([{ username: "cousin@example.com", email: "cousin@example.com" }]);
  });

  it("lowercases the username but passes the email as given", async () => {
    const { directory, calls } = stubDirectory();
    const res = await post(inviteApp(directory), "alice", { email: " Cousin@Example.com " });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ username: "cousin@example.com", email: "Cousin@Example.com" });
    expect(calls).toEqual([{ username: "cousin@example.com", email: "Cousin@Example.com" }]);
  });

  it("ignores a username in the body", async () => {
    const { directory, calls } = stubDirectory();
    const res = await post(inviteApp(directory), "alice", { ...valid, username: "someone-else" });
    expect(res.status).toBe(201);
    expect(res.body.username).toBe("cousin@example.com");
    expect(calls).toEqual([{ username: "cousin@example.com", email: "cousin@example.com" }]);
  });

  it("409s when the email already has an account", async () => {
    const { directory, state } = stubDirectory();
    state.exists = true;
    const res = await post(inviteApp(directory), "alice", valid);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("that email already has an account");
  });

  it("lists accounts for an admin only", async () => {
    const { directory } = stubDirectory();
    const get = (a: ReturnType<typeof createApp>, as: string) =>
      request(a).get("/api/users").set("Authorization", `Bearer ${as}-token`);
    const forbidden = await get(inviteApp(directory), "bob");
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error).toBe("only an admin can see accounts");
    const missing = await get(inviteApp(null), "alice");
    expect(missing.status).toBe(503);
    expect(missing.body.error).toBe("accounts are not configured");
    const ok = await get(inviteApp(directory), "alice");
    expect(ok.status).toBe(200);
    expect(ok.body.users).toMatchObject(stubAccounts);
    expect(ok.body.users.map((u: UserAccount) => u.displayName)).toEqual(["Alice", null]);
    expect((await request(inviteApp(directory)).get("/api/users")).status).toBe(401);
  });

  it("marks accounts active or invited and counts each person's recipes", async () => {
    const { directory } = stubDirectory();
    const sam: UserAccount = {
      username: "sam",
      email: "sam@example.com",
      displayName: "sam",
      createdAt: "2026-03-01T00:00:00.000Z",
      enabled: true,
      status: "CONFIRMED",
    };
    const withSam: UserDirectory = {
      ...directory,
      list: async () => [...stubAccounts, sam],
    };
    // Alice signed some recipes with her chosen name and one with her sign-in
    // name, from before she chose; the invited cousin has one under their
    // email. Sam's chosen name is also their sign-in name, so theirs count once.
    const sign = (createdBy: string, title: string) =>
      db.createRecipe({ title }, { createdBy, source: "web" });
    await sign("Alice", "Alice Soup");
    await sign("Alice", "Alice Stew");
    await sign("alice", "Alice Early Bread");
    await sign("cousin@example.com", "Cousin Pie");
    await sign("sam", "Sam Salad");
    await sign("sam", "Sam Soup");
    const res = await request(inviteApp(withSam))
      .get("/api/users")
      .set("Authorization", "Bearer alice-token");
    expect(
      res.body.users.map((u: { username: string; state: string; recipeCount: number }) => [
        u.username,
        u.state,
        u.recipeCount,
      ]),
    ).toEqual([
      ["alice", "active", 3],
      ["cousin@example.com", "invited", 1],
      ["sam", "active", 2],
    ]);
  });
});

describe("usernames", () => {
  const nameApp = (directory: UserDirectory | null) =>
    createApp({ db, verifier: namedVerifier, directory });
  const me = (a: ReturnType<typeof createApp>) =>
    request(a).get("/api/me").set("Authorization", "Bearer cousin-token");
  const choose = (a: ReturnType<typeof createApp>, body: object) =>
    request(a).post("/api/me/username").set("Authorization", "Bearer cousin-token").send(body);

  it("asks for a username until one is chosen", async () => {
    const { directory, state } = stubDirectory();
    const a = nameApp(directory);
    expect((await me(a)).body).toEqual({
      username: "cousin",
      displayName: null,
      canInvite: false,
      needsUsername: true,
    });
    state.displayName = "Cuz";
    expect((await me(a)).body).toEqual({
      username: "cousin",
      displayName: "Cuz",
      canInvite: false,
      needsUsername: false,
    });
  });

  it("never asks without a directory", async () => {
    const res = await me(nameApp(null));
    expect(res.body.needsUsername).toBe(false);
    expect(res.body.displayName).toBe("cousin");
  });

  it("rejects names that are too short, too long or use other characters", async () => {
    const { directory, nameCalls } = stubDirectory();
    const a = nameApp(directory);
    const bad = [
      "a",
      "a".repeat(33),
      "two words",
      'say "hi"',
      ".dot-first",
      "-dash-first",
      "émile",
      "",
    ];
    for (const username of bad) {
      const res = await choose(a, { username });
      expect(res.status, username).toBe(400);
      expect(res.body.error).toBe(
        "username must be 2–32 letters, numbers, dots, dashes or underscores",
      );
    }
    expect((await choose(a, {})).status).toBe(400);
    expect((await choose(a, { username: 5 })).status).toBe(400);
    expect(nameCalls).toEqual([]);
  });

  it("accepts the length limits and allowed punctuation", async () => {
    const { directory, nameCalls } = stubDirectory();
    const a = nameApp(directory);
    for (const username of ["ab", "a".repeat(32), "Mary.Jane_2-b"]) {
      const res = await choose(a, { username });
      expect(res.status, username).toBe(200);
      expect(res.body).toEqual({ displayName: username });
    }
    expect(nameCalls).toHaveLength(3);
  });

  it("409s when someone else has the name", async () => {
    const { directory, state } = stubDirectory();
    state.taken = true;
    const res = await choose(nameApp(directory), { username: "alice" });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("that username is taken");
  });

  it("passes the sign-in name and the chosen name to the directory", async () => {
    const { directory, nameCalls } = stubDirectory();
    const res = await choose(nameApp(directory), { username: "cuz" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ displayName: "cuz" });
    expect(nameCalls).toEqual([{ username: "cousin", displayName: "cuz" }]);
  });

  it("503s without a directory and 401s without a token", async () => {
    const res = await choose(nameApp(null), { username: "cuz" });
    expect(res.status).toBe(503);
    expect(res.body.error).toBe("accounts are not configured");
    const { directory } = stubDirectory();
    expect(
      (await request(nameApp(directory)).post("/api/me/username").send({ username: "cuz" })).status,
    ).toBe(401);
  });

  it("signs new and duplicated recipes with the chosen name", async () => {
    const { directory, state } = stubDirectory();
    state.displayName = "Cuz";
    const a = nameApp(directory);
    const created = await request(a)
      .post("/api/recipes")
      .set("Authorization", "Bearer cousin-token")
      .send({ title: "Signed Soup" });
    expect(created.status).toBe(201);
    expect(created.body.createdBy).toBe("Cuz");
    state.displayName = "Cuz II";
    const copy = await request(a)
      .post(`/api/recipes/${created.body.id}/duplicate`)
      .set("Authorization", "Bearer cousin-token");
    expect(copy.status).toBe(201);
    expect(copy.body.createdBy).toBe("Cuz II");
  });

  it("refuses to sign a recipe until a username is chosen, and signs as dev locally", async () => {
    const { directory } = stubDirectory();
    const a = nameApp(directory);
    const created = await request(a)
      .post("/api/recipes")
      .set("Authorization", "Bearer cousin-token")
      .send({ title: "Unsigned Soup" });
    expect(created.status).toBe(403);
    expect(created.body.error).toBe("choose a username first");
    expect(await db.findRecipeIdByTitle("Unsigned Soup")).toBeNull();
    const local = await request(app).post("/api/recipes").send({ title: "Local Soup" });
    expect(local.body.createdBy).toBe("dev");
    expect((await request(app).get("/api/me")).body.needsUsername).toBe(false);
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
