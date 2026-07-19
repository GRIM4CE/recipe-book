import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { TokenVerifier } from "../src/auth.js";
import { createDb, type Db } from "../src/db.js";
import type { ExtractInput, ExtractedRecipe, Extractor } from "../src/extract.js";

const found: ExtractedRecipe = {
  found: true,
  title: "Pancakes",
  summary: "Fluffy weekend pancakes",
  ingredients: ["2 cups flour", "2 eggs"],
  instructions: ["Mix everything.", "Fry in butter."],
  category: "Breakfast",
};

// Records the inputs it was given and returns a canned result (or throws).
function stubExtractor(result: ExtractedRecipe | Error) {
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
      extractor: stubExtractor(found).extractor,
    });
    const res = await request(app).post("/api/extract").send({ text: "hi" });
    expect(res.status).toBe(401);
  });

  it("400s malformed payloads", async () => {
    const app = createApp({ db, extractor: stubExtractor(found).extractor });
    const cases = [
      {},
      { text: "" },
      { text: 7 },
      { text: "x", image: "y" },
      { image: "abc" }, // missing mediaType
      { image: "abc", mediaType: "image/png" },
      { image: 7, mediaType: "image/jpeg" },
    ];
    for (const body of cases) {
      const res = await request(app).post("/api/extract").send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });

  it("extracts from text and resolves the category by name", async () => {
    const { extractor, calls } = stubExtractor(found);
    const app = createApp({ db, extractor });
    const res = await request(app)
      .post("/api/extract")
      .send({ text: "pancake recipe blob" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      title: "Pancakes",
      summary: "Fluffy weekend pancakes",
      ingredients: ["2 cups flour", "2 eggs"],
      instructions: ["Mix everything.", "Fry in butter."],
      categoryId: breakfastId,
    });
    expect(calls[0].text).toBe("pancake recipe blob");
    expect(calls[0].categoryNames).toEqual(["Breakfast"]);
  });

  it("extracts from an image and nulls unknown categories", async () => {
    const { extractor, calls } = stubExtractor({
      ...found,
      category: "Nonexistent",
    });
    const app = createApp({ db, extractor });
    const res = await request(app)
      .post("/api/extract")
      .send({ image: "aGVsbG8=", mediaType: "image/jpeg" });
    expect(res.status).toBe(200);
    expect(res.body.categoryId).toBeNull();
    expect(calls[0].image).toBe("aGVsbG8=");
  });

  it("422s when the input has no recipe", async () => {
    const none: ExtractedRecipe = {
      found: false,
      title: "",
      summary: "",
      ingredients: [],
      instructions: [],
      category: null,
    };
    const app = createApp({ db, extractor: stubExtractor(none).extractor });
    const res = await request(app)
      .post("/api/extract")
      .send({ text: "a cat photo caption" });
    expect(res.status).toBe(422);
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
