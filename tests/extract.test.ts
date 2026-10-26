import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { createClient, type Client } from "@libsql/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { TokenVerifier } from "../src/auth.js";
import { createDb, type Db } from "../src/db.js";
import {
  buildPrompt,
  describeExtractionError,
  ExtractionFailure,
} from "../src/extract.js";
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
  credit: null,
  language: "en" as const,
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
      { images: [], mediaType: "image/jpeg" }, // empty array
      { images: ["ok", 7], mediaType: "image/jpeg" }, // non-string member
      { images: ["ok"] }, // missing mediaType
      { image: "a", images: ["b"], mediaType: "image/jpeg" }, // both given
      { url: 7 },
      { url: "not a url" },
      { url: "ftp://example.com/x" },
    ];
    for (const body of cases) {
      const res = await request(app).post("/api/extract").send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });

  it("rate limits extraction per user", async () => {
    const { extractor, calls } = stubExtractor(one);
    const app = createApp({
      db,
      extractor,
      extractRateLimit: { max: 2, windowMs: 60_000 },
    });
    for (let i = 0; i < 2; i++) {
      expect(
        (await request(app).post("/api/extract").send({ text: "hi" })).status,
      ).toBe(200);
    }
    const res = await request(app).post("/api/extract").send({ text: "hi" });
    expect(res.status).toBe(429);
    expect(calls).toHaveLength(2);
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
      language: "en",
      categoryId: breakfastId,
      // No URL and no credit in a plain text import → empty attribution.
      notes: "",
    };
    // Response carries `recipes` and, for older cached web bundles, the first
    // recipe's fields spread at the top level.
    expect(res.body).toEqual({ recipes: [pancakeOut], ...pancakeOut });
    expect(calls[0].text).toBe("pancake recipe blob");
    expect(calls[0].categoryNames).toEqual(["Breakfast"]);
  });

  it("passes the detected language through", async () => {
    const app = createApp({
      db,
      extractor: stubExtractor({
        pageUnreadable: false,
        recipes: [{ ...pancakes, title: "Crêpes", language: "fr" }],
      }).extractor,
    });
    const res = await request(app).post("/api/extract").send({ text: "des crêpes" });
    expect(res.status).toBe(200);
    expect(res.body.recipes[0].language).toBe("fr");
    expect(res.body.language).toBe("fr");
  });

  it("passes a single image through as a one-element array", async () => {
    const { extractor, calls } = stubExtractor(one);
    const app = createApp({ db, extractor });
    const res = await request(app)
      .post("/api/extract")
      .send({ image: "aGVsbG8=", mediaType: "image/jpeg" });
    expect(res.status).toBe(200);
    expect(calls[0].images).toEqual(["aGVsbG8="]);
  });

  it("passes multiple images through", async () => {
    const { extractor, calls } = stubExtractor(one);
    const app = createApp({ db, extractor });
    const res = await request(app)
      .post("/api/extract")
      .send({ images: ["aGVsbG8=", "d29ybGQ="], mediaType: "image/jpeg" });
    expect(res.status).toBe(200);
    expect(calls[0].images).toEqual(["aGVsbG8=", "d29ybGQ="]);
  });

  it("passes a url through and resolves categories per recipe", async () => {
    const { extractor, calls } = stubExtractor({
      pageUnreadable: false,
      recipes: [
        pancakes,
        {
          ...pancakes,
          title: "Waffles",
          category: "Nonexistent",
          credit: "Chef Ann",
        },
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
    // The source URL is kept for every recipe; the credit is added when the
    // page named an author.
    expect(res.body.recipes[0].notes).toBe("Source: https://claude.ai/share/abc");
    expect(res.body.recipes[1].notes).toBe(
      "Source: https://claude.ai/share/abc\nCredit: Chef Ann",
    );
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
    expect(res.body.error).toMatch(/wouldn't let us read the page/);
    expect(res.body.error).toMatch(/paste it instead/);
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

  it("502s with a reason when extraction fails for an unknown cause", async () => {
    const app = createApp({
      db,
      extractor: stubExtractor(new Error("boom")).extractor,
    });
    const res = await request(app).post("/api/extract").send({ text: "x" });
    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/failed unexpectedly/);
  });

  it("passes the reader's status and reason through to the client", async () => {
    const limited = new Anthropic.RateLimitError(
      429,
      { type: "error", error: { type: "rate_limit_error", message: "slow" } },
      "slow",
      new Headers(),
    );
    const app = createApp({ db, extractor: stubExtractor(limited).extractor });
    const res = await request(app).post("/api/extract").send({ text: "x" });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/rate-limited/);
  });
});

describe("describeExtractionError", () => {
  const body = (message: string) => ({
    type: "error",
    error: { type: "invalid_request_error", message },
  });

  it("names a timeout and suggests pasting the text", () => {
    const d = describeExtractionError(new Anthropic.APIConnectionTimeoutError());
    expect(d.status).toBe(504);
    expect(d.message).toMatch(/longer than 50 seconds/);
    expect(d.message).toMatch(/paste it instead/);
  });

  it("names a rejected API key", () => {
    const d = describeExtractionError(
      new Anthropic.AuthenticationError(401, body("invalid x-api-key"), "x", new Headers()),
    );
    expect(d.status).toBe(502);
    expect(d.message).toMatch(/API key was rejected/);
  });

  it("surfaces the API's own message for other rejections", () => {
    const d = describeExtractionError(
      new Anthropic.BadRequestError(
        400,
        body("Your credit balance is too low to access the Anthropic API."),
        "400 bad request",
        new Headers(),
      ),
    );
    expect(d.status).toBe(502);
    expect(d.message).toMatch(/credit balance is too low/);
  });

  it("keeps an ExtractionFailure's own status and message", () => {
    const d = describeExtractionError(new ExtractionFailure(422, "declined"));
    expect(d).toEqual({ status: 422, message: "declined" });
  });
});

describe("buildPrompt servings guidance", () => {
  const prompt = buildPrompt({ text: "some recipe", categoryNames: [] });

  it("instructs estimating servings when not stated", () => {
    expect(prompt).toMatch(/If not stated, estimate/);
  });

  it("defaults cocktails to a single serving", () => {
    expect(prompt).toMatch(/cocktails[\s\S]*use "1"/);
  });

  it("never leaves servings empty", () => {
    expect(prompt).toContain("Never leave this empty.");
  });

  it("asks for the recipe's author credit", () => {
    expect(prompt).toMatch(/credit: who the recipe is credited to/);
  });

  it("asks for the recipe's language, en when neither", () => {
    expect(prompt).toMatch(/language: the language the recipe is written in/);
    expect(prompt).toContain('Use "en" when it is neither.');
  });
});
