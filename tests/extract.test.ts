import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { TokenVerifier } from "../src/auth.js";
import { createDb, type Db } from "../src/db.js";
import type {
  ExtractInput,
  ExtractionResult,
  Extractor,
} from "../src/extract.js";

const pancakes = {
  title: "Pancakes",
  summary: "Fluffy weekend pancakes",
  servings: "4",
  ingredients: ["2 cups flour", "2 eggs"],
  instructions: ["Mix everything.", "Fry in butter."],
  category: "Breakfast",
};

const one: ExtractionResult = { pageUnreadable: false, recipes: [pancakes] };

// Records the inputs it was given and returns a canned result (or throws).
function stubExtractor(result: ExtractionResult | Error) {
  const calls: ExtractInput[] = [];
  const extractor: Extractor = {
    async extract(input) {
      calls.push(input);
      if (result instanceof Error) throw result;
      return result;
    },
  };
  return { extractor, calls };
}

let dir: string;
let client: Client;
let db: Db;
let breakfastId: number;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "recipe-extract-"));
  client = createClient({ url: `file:${join(dir, "test.db")}` });
  db = createDb(client);
  await db.applySchema();
  breakfastId = (
    await db.createCategory({ name: "Breakfast", color: "#ffcc00" })
  ).id;
});

afterAll(() => {
  client.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("POST /api/extract", () => {
  it("503s when no extractor is configured", async () => {
    const app = createApp({ db });
    const res = await request(app).post("/api/extract").send({ text: "hi" });
    expect(res.status).toBe(503);
  });

  it("requires auth like other writes", async () => {
    const verifier: TokenVerifier = {
      async verify() {
        throw new Error("bad token");
      },
    };
    const app = createApp({
      db,
      verifier,
      extractor: stubExtractor(one).extractor,
    });
    const res = await request(app).post("/api/extract").send({ text: "hi" });
    expect(res.status).toBe(401);
  });

  it("400s malformed payloads", async () => {
    const app = createApp({ db, extractor: stubExtractor(one).extractor });
    const cases = [
      {},
      { text: "" },
      { text: 7 },
      { text: "x", image: "y" },
      { text: "x", url: "https://ok.example" },
      { image: "abc" }, // missing mediaType
      { image: "abc", mediaType: "image/png" },
      { image: 7, mediaType: "image/jpeg" },
      { url: 7 },
      { url: "not a url" },
      { url: "ftp://example.com/x" },
    ];
    for (const body of cases) {
      const res = await request(app).post("/api/extract").send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });

  it("extracts from text and resolves the category by name", async () => {
    const { extractor, calls } = stubExtractor(one);
    const app = createApp({ db, extractor });
    const res = await request(app)
      .post("/api/extract")
      .send({ text: "pancake recipe blob" });
    expect(res.status).toBe(200);
    const pancakeOut = {
      title: "Pancakes",
      summary: "Fluffy weekend pancakes",
      servings: "4",
      ingredients: ["2 cups flour", "2 eggs"],
      instructions: ["Mix everything.", "Fry in butter."],
      categoryId: breakfastId,
    };
    // Response carries `recipes` and, for older cached web bundles, the first
    // recipe's fields spread at the top level.
    expect(res.body).toEqual({ recipes: [pancakeOut], ...pancakeOut });
    expect(calls[0].text).toBe("pancake recipe blob");
    expect(calls[0].categoryNames).toEqual(["Breakfast"]);
  });

  it("passes an image through", async () => {
    const { extractor, calls } = stubExtractor(one);
    const app = createApp({ db, extractor });
    const res = await request(app)
      .post("/api/extract")
      .send({ image: "aGVsbG8=", mediaType: "image/jpeg" });
    expect(res.status).toBe(200);
    expect(calls[0].image).toBe("aGVsbG8=");
  });

  it("passes a url through and resolves categories per recipe", async () => {
    const { extractor, calls } = stubExtractor({
      pageUnreadable: false,
      recipes: [
        pancakes,
        { ...pancakes, title: "Waffles", category: "Nonexistent" },
      ],
    });
    const app = createApp({ db, extractor });
    const res = await request(app)
      .post("/api/extract")
      .send({ url: "https://claude.ai/share/abc" });
    expect(res.status).toBe(200);
    expect(res.body.recipes).toHaveLength(2);
    expect(res.body.recipes[0].categoryId).toBe(breakfastId);
    expect(res.body.recipes[1].categoryId).toBeNull();
    expect(res.body.recipes[1].title).toBe("Waffles");
    expect(calls[0].url).toBe("https://claude.ai/share/abc");
  });

  it("422s with copy-paste guidance when the page was unreadable", async () => {
    const app = createApp({
      db,
      extractor: stubExtractor({ pageUnreadable: true, recipes: [] }).extractor,
    });
    const res = await request(app)
      .post("/api/extract")
      .send({ url: "https://claude.ai/share/abc" });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe(
      "couldn't read that page — copy the recipe text instead",
    );
  });

  it("422s when nothing was found", async () => {
    const app = createApp({
      db,
      extractor: stubExtractor({ pageUnreadable: false, recipes: [] })
        .extractor,
    });
    const res = await request(app)
      .post("/api/extract")
      .send({ text: "a cat photo caption" });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("no recipe found in that input");
  });

  it("502s when extraction fails", async () => {
    const app = createApp({
      db,
      extractor: stubExtractor(new Error("boom")).extractor,
    });
    const res = await request(app).post("/api/extract").send({ text: "x" });
    expect(res.status).toBe(502);
  });
});
