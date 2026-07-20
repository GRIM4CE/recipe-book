# Recipe Import from URLs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Paste any http(s) URL (Claude chat share links included) into the import panel and extract one or more recipes from the page, with a picker when several are found.

**Architecture:** The existing `POST /api/extract` gains a `{ url }` input. Fetching is delegated to Anthropic's `web_fetch_20260209` server tool inside the existing extraction call — no fetch/scrape code in the Lambda. The extraction contract becomes list-shaped for all input modes (`{ recipes: [...] }`), with `pageUnreadable` as a first-class outcome mapped to a copy-paste-fallback 422. Spec: `docs/superpowers/specs/2026-07-19-url-import-design.md`.

**Tech Stack:** Unchanged — TypeScript ESM Express 5, `@anthropic-ai/sdk` (already installed), vitest + supertest, React 19 plain JS.

## Global Constraints

- No new dependencies anywhere (backend or `web/`).
- Model string stays exactly `claude-opus-4-8`; thinking/`max_tokens`/`output_config` unchanged from the current extractor.
- All backend imports use explicit `.js` extensions (ESM).
- Tests stay deterministic: extractor always stubbed, no network, temp `file:` libsql db per test file.
- Success response shape for ALL input modes: `{ recipes: [{ title, summary, ingredients, instructions, categoryId }, …] }` with ≥1 entries.
- Exact 422 messages: `couldn't read that page — copy the recipe text instead` (unreadable) and `no recipe found in that input` (empty).
- `web_fetch` tool config: `type: "web_fetch_20260209"`, `name: "web_fetch"`, `max_uses: 3`, `allowed_domains: [<hostname of the pasted url>]` — URL mode only.
- Lambda `Timeout` in `template.yaml` goes 15 → 60. No other infra changes.
- Commit style per `.claude/conventions.md`; every commit message ends with the trailer line `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Run from repo root: `npm test`, `npm run typecheck`, `npm test --prefix web`.

---

### Task 1: List-shaped extraction contract + `{ url }` input on the route

**Files:**
- Modify: `src/extract.ts:6-27` (interfaces only — `RECIPE_SCHEMA`/`buildPrompt`/`createClaudeExtractor` are Task 2's job, but this task must keep the file compiling: see Step 3)
- Modify: `src/app.ts:8` (import), `src/app.ts:105-124` (`parseExtractInput`), `src/app.ts:142-178` (route handler body)
- Test: `tests/extract.test.ts` (rewrite)

**Interfaces:**
- Consumes: existing `createApp` options, `db.listCategories()`, `db.getCategoryByName(name)`.
- Produces (Tasks 2–3 rely on these exact names):
  - `ExtractInput { text?: string; image?: string; url?: string; categoryNames: string[] }`
  - `ExtractedRecipe { title: string; summary: string; ingredients: string[]; instructions: string[]; category: string | null }` (the `found` field is GONE)
  - `ExtractionResult { pageUnreadable: boolean; recipes: ExtractedRecipe[] }`
  - `Extractor { extract(input: ExtractInput): Promise<ExtractionResult> }`
  - Route: 200 `{ recipes: [{ title, summary, ingredients, instructions, categoryId }] }`; 422 messages exactly as in Global Constraints.

- [ ] **Step 1: Rewrite the test file (failing first)**

Replace the whole of `tests/extract.test.ts` with:

```ts
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
    expect(res.body).toEqual({
      recipes: [
        {
          title: "Pancakes",
          summary: "Fluffy weekend pancakes",
          ingredients: ["2 cups flour", "2 eggs"],
          instructions: ["Mix everything.", "Fry in butter."],
          categoryId: breakfastId,
        },
      ],
    });
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/extract.test.ts`
Expected: FAIL — `ExtractionResult` is not exported and the route still returns the single-recipe shape.

- [ ] **Step 3: Update the interfaces in `src/extract.ts`**

Replace lines 6–27 (the three interfaces) with:

```ts
export interface ExtractInput {
  text?: string;
  // Base64 JPEG bytes (no data: prefix).
  image?: string;
  // Absolute http(s) URL to fetch and extract from.
  url?: string;
  // Existing category names so the model picks one of ours or none.
  categoryNames: string[];
}

export interface ExtractedRecipe {
  title: string;
  summary: string;
  ingredients: string[];
  instructions: string[];
  // A category name from categoryNames, or null.
  category: string | null;
}

export interface ExtractionResult {
  // True only when a url was given and its content could not be retrieved.
  pageUnreadable: boolean;
  // Every distinct recipe found; empty when the input had none.
  recipes: ExtractedRecipe[];
}

export interface Extractor {
  extract(input: ExtractInput): Promise<ExtractionResult>;
}
```

Removing `found` breaks `RECIPE_SCHEMA`/`buildPrompt`/`createClaudeExtractor` typing further down the file. To keep this task self-contained and compiling, make the smallest bridging edit in `createClaudeExtractor` — replace its last line:

```ts
      return JSON.parse(text.text) as ExtractedRecipe;
```

with:

```ts
      return JSON.parse(text.text) as ExtractionResult;
```

and in `RECIPE_SCHEMA` delete the `found` property and its `"found",` entry in `required` (the schema/prompt correctness for the list shape is Task 2 — this task only needs typecheck-clean; the wrapper is untested code either way). Leave `buildPrompt` alone (it references no removed types).

- [ ] **Step 4: Update `src/app.ts`**

(a) Change the type import on line 8 to:

```ts
import type { ExtractionResult, Extractor } from "./extract.js";
```

(b) Replace the whole `parseExtractInput` function (lines 105–124) with:

```ts
function parseExtractInput(
  body: unknown,
): { text: string } | { image: string } | { url: string } | string {
  if (typeof body !== "object" || body === null) return "body must be an object";
  const b = body as Record<string, unknown>;
  const given = ["text", "image", "url"].filter((k) => b[k] !== undefined);
  if (given.length !== 1) return "provide exactly one of text, image, or url";
  if (b.text !== undefined) {
    if (typeof b.text !== "string" || !b.text.trim()) {
      return "text must be a non-empty string";
    }
    return { text: b.text };
  }
  if (b.url !== undefined) {
    if (typeof b.url !== "string") return "url must be a string";
    let parsed: URL;
    try {
      parsed = new URL(b.url);
    } catch {
      return "url must be an absolute http(s) URL";
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "url must be an absolute http(s) URL";
    }
    return { url: b.url };
  }
  if (typeof b.image !== "string" || !b.image) {
    return "image must be a base64 string";
  }
  if (b.mediaType !== "image/jpeg") return "mediaType must be image/jpeg";
  return { image: b.image };
}
```

(c) In the route handler, replace everything from `let result: ExtractedRecipe;` through the final `res.json({...});` (lines 153–177) with:

```ts
      let result: ExtractionResult;
      try {
        result = await opts.extractor.extract({
          ...input,
          categoryNames: categories.map((c) => c.name),
        });
      } catch (err) {
        console.error("extraction failed:", err);
        res.status(502).json({ error: "extraction failed" });
        return;
      }
      if (result.pageUnreadable) {
        res.status(422).json({
          error: "couldn't read that page — copy the recipe text instead",
        });
        return;
      }
      if (result.recipes.length === 0) {
        res.status(422).json({ error: "no recipe found in that input" });
        return;
      }
      const recipes = [];
      for (const r of result.recipes) {
        const category = r.category
          ? await db.getCategoryByName(r.category)
          : null;
        recipes.push({
          title: r.title,
          summary: r.summary,
          ingredients: r.ingredients,
          instructions: r.instructions,
          categoryId: category?.id ?? null,
        });
      }
      res.json({ recipes });
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/extract.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 6: Full suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/extract.ts src/app.ts tests/extract.test.ts
git commit -m "feat: url input and list-shaped responses on /api/extract

One contract for text/photo/url; pageUnreadable is a first-class 422 so
unfetchable pages degrade to copy-paste guidance instead of a mystery."
```

---

### Task 2: web_fetch in the Claude wrapper + 60s timeout

**Files:**
- Modify: `src/extract.ts` (`RECIPE_SCHEMA` → `RESULT_SCHEMA`, `buildPrompt`, `createClaudeExtractor`)
- Modify: `template.yaml:39` (`Timeout: 15` → `Timeout: 60`)
- Modify: `docs/deploy.md` (post-deploy checklist)

**Interfaces:**
- Consumes: `ExtractInput` (now with `url?`), `ExtractionResult` from Task 1.
- Produces: `createClaudeExtractor` unchanged signature, now returning the list shape and fetching URLs via the server tool.

- [ ] **Step 1: Replace schema + prompt + call in `src/extract.ts`**

Replace `RECIPE_SCHEMA` (and its Task-1 bridging edit) with:

```ts
// Strict response schema. pageUnreadable distinguishes "couldn't fetch the
// page" from "page had no recipes" so the route can give copy-paste guidance.
const RESULT_SCHEMA = {
  type: "object",
  properties: {
    pageUnreadable: {
      type: "boolean",
      description:
        "true only when a URL was provided and its content could not be retrieved",
    },
    recipes: {
      type: "array",
      description: "every distinct recipe found; empty when there are none",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          summary: {
            type: "string",
            description: "one short line about the dish",
          },
          ingredients: { type: "array", items: { type: "string" } },
          instructions: { type: "array", items: { type: "string" } },
          category: {
            anyOf: [{ type: "string" }, { type: "null" }],
            description: "one of the provided category names, or null",
          },
        },
        required: [
          "title",
          "summary",
          "ingredients",
          "instructions",
          "category",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["pageUnreadable", "recipes"],
  additionalProperties: false,
};
```

Replace `buildPrompt` with:

```ts
function buildPrompt(input: ExtractInput): string {
  const source = input.image
    ? "Read the recipe in the attached image (it may be handwritten, a cookbook page, or a screenshot)."
    : input.url
      ? `Fetch this page and extract every distinct recipe on it: ${input.url}`
      : "Extract every distinct recipe from the text below.";
  return [
    "Extract recipes into structured data for a recipe app.",
    source,
    "Rules:",
    "- one entry per distinct recipe; variations of the same dish are one recipe.",
    "- ingredients: one entry per ingredient, quantities as written.",
    "- instructions: one entry per step, without step numbers.",
    "- summary: one short line describing the dish.",
    `- category: per recipe, the best fit among [${input.categoryNames.join(", ")}], or null if none fits.`,
    "- If the input contains no recipe, return an empty recipes array.",
    "- Set pageUnreadable to true only when a URL was provided and you could not retrieve its content; otherwise false.",
    ...(input.text ? ["", input.text] : []),
  ].join("\n");
}
```

Replace the body of `extract(input)` in `createClaudeExtractor` with:

```ts
      const content: Anthropic.ContentBlockParam[] = [];
      if (input.image) {
        content.push({
          type: "image",
          source: { type: "base64", media_type: "image/jpeg", data: input.image },
        });
      }
      content.push({ type: "text", text: buildPrompt(input) });

      const base = {
        model: "claude-opus-4-8",
        max_tokens: 16000,
        thinking: { type: "adaptive" as const },
        output_config: {
          format: { type: "json_schema" as const, schema: RESULT_SCHEMA },
        },
        ...(input.url
          ? {
              tools: [
                {
                  type: "web_fetch_20260209" as const,
                  name: "web_fetch" as const,
                  max_uses: 3,
                  allowed_domains: [new URL(input.url).hostname],
                },
              ],
            }
          : {}),
      };

      const messages: Anthropic.MessageParam[] = [{ role: "user", content }];
      let response = await client.messages.create({ ...base, messages });
      // Server-tool turns can pause mid-loop; append the assistant turn and
      // re-send to resume, bounded so a wedged loop becomes a 502.
      for (let i = 0; i < 5 && response.stop_reason === "pause_turn"; i++) {
        messages.push({ role: "assistant", content: response.content });
        response = await client.messages.create({ ...base, messages });
      }
      if (response.stop_reason === "pause_turn") {
        throw new Error("extraction did not finish (pause_turn limit)");
      }
      // With server tools the transcript interleaves tool blocks; the JSON
      // answer is the LAST text block.
      const text = [...response.content]
        .reverse()
        .find((b): b is Anthropic.TextBlock => b.type === "text");
      if (!text) {
        throw new Error(
          `no text block in response (stop_reason: ${response.stop_reason})`,
        );
      }
      return JSON.parse(text.text) as ExtractionResult;
```

Implementer notes: if a type name or the spread-conditional `tools` shape doesn't typecheck against the installed `@anthropic-ai/sdk`, fix from the compiler error while keeping request semantics identical (same tool type/name/max_uses/allowed_domains, same output_config). `[...].reverse().find` is used instead of `findLast` to avoid depending on the tsconfig `lib` level.

- [ ] **Step 2: Bump the Lambda timeout**

In `template.yaml`, change `Timeout: 15` to `Timeout: 60` (fetch + extraction won't reliably fit in 15s).

- [ ] **Step 3: Extend the deploy smoke checklist**

In `docs/deploy.md`, in the post-deploy checklist, after the existing extract line add:

```
- [ ] New Recipe → paste a recipe-site URL → Extract prefills (or picker for several); a Claude share link either extracts or shows the copy-paste guidance
```

- [ ] **Step 4: Verify build health**

Run: `npm test && npm run typecheck`
Expected: all green (the wrapper stays untested per spec; typecheck exercises it).

- [ ] **Step 5: Commit**

```bash
git add src/extract.ts template.yaml docs/deploy.md
git commit -m "feat: fetch url imports via the web_fetch server tool

Anthropic fetches the page inside the extraction call (domain-locked,
pause_turn-safe), so the Lambda never scrapes; timeout raised to fit."
```

---

### Task 3: URL row + multi-recipe picker in the import panel

**Files:**
- Modify: `web/src/components/RecipeForm.jsx:28-85` (state + handlers) and `:116-156` (panel JSX)
- Modify: `web/src/styles.css` (next to the existing `.import-panel` rule)

**Interfaces:**
- Consumes: `api.extractRecipe(payload)` (unchanged — same endpoint; new `{ url }` body key); route 200 shape `{ recipes: [...] }` from Task 1.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Update state and handlers in `RecipeForm.jsx`**

Add to the import-panel state block (after `importing`):

```js
  const [importUrl, setImportUrl] = useState('');
  // Non-null after an extraction that found several recipes: the picker list.
  const [foundRecipes, setFoundRecipes] = useState(null);
```

Replace `runImport` with:

```js
  function applyRecipe(r) {
    setTitle(r.title);
    setSummary(r.summary);
    setCategoryId(r.categoryId ?? '');
    setIngredients(r.ingredients.join('\n'));
    setInstructions(r.instructions.join('\n'));
    setImportText('');
    setImportUrl('');
    setFoundRecipes(null);
    setShowImport(false);
  }

  async function runImport(payload) {
    setImporting(true);
    setError(null);
    try {
      const { recipes } = await api.extractRecipe(payload);
      if (recipes.length === 1) applyRecipe(recipes[0]);
      else setFoundRecipes(recipes);
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  }
```

(`importFromPhoto` is unchanged — it already funnels through `runImport`.)

- [ ] **Step 2: Update the panel JSX**

Replace the whole `{!recipe && (...)}` block with (three views: picker → open panel → collapsed button):

```jsx
      {!recipe &&
        (foundRecipes ? (
          <div className="import-panel">
            <span className="field-title">
              Found {foundRecipes.length} recipes — pick one
            </span>
            {foundRecipes.map((r, i) => (
              <button
                key={i}
                className="btn ghost small"
                type="button"
                onClick={() => applyRecipe(r)}
              >
                {r.title}
              </button>
            ))}
            <div className="form-actions import-actions">
              <button
                className="btn ghost small"
                type="button"
                onClick={() => setFoundRecipes(null)}
              >
                Back
              </button>
            </div>
          </div>
        ) : showImport ? (
          <div className="import-panel">
            <span className="field-title">Import from a URL, text, or photo</span>
            <div className="import-url-row">
              <input
                type="url"
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                placeholder="Link to a recipe page or Claude chat"
                disabled={importing}
              />
              <button
                className="btn ghost small"
                type="button"
                onClick={() => runImport({ url: importUrl.trim() })}
                disabled={importing || !importUrl.trim()}
              >
                {importing ? 'Reading…' : 'Extract from URL'}
              </button>
            </div>
            <textarea
              rows={4}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="…or paste recipe text here"
              disabled={importing}
            />
            <div className="form-actions import-actions">
              <button
                className="btn ghost small"
                type="button"
                onClick={() => runImport({ text: importText })}
                disabled={importing || !importText.trim()}
              >
                {importing ? 'Reading recipe…' : 'Extract from text'}
              </button>
              <label className="btn ghost small">
                {importing ? 'Reading recipe…' : 'Extract from photo'}
                <input
                  type="file"
                  accept="image/*"
                  onChange={importFromPhoto}
                  hidden
                  disabled={importing}
                />
              </label>
            </div>
          </div>
        ) : (
          <button
            className="btn ghost small"
            type="button"
            onClick={() => setShowImport(true)}
          >
            Import from a URL, text, or photo
          </button>
        ))}
```

- [ ] **Step 3: Style the URL row**

In `web/src/styles.css`, directly after the `.import-panel` rule, add:

```css
.import-url-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.import-url-row input {
  flex: 1;
  min-width: 0;
}
```

Check how the form styles its inputs (search `styles.css` for the selector that gives form inputs their padding/border — if it only matches `label input`/`label textarea`, extend that rule to include `.import-url-row input` so the URL field matches visually; if inputs are styled globally, no extra rule is needed).

- [ ] **Step 4: Verify web build health**

Run: `npm test --prefix web && npm run build --prefix web`
Expected: existing tests pass; vite build succeeds.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/RecipeForm.jsx web/src/styles.css
git commit -m "feat: url import with multi-recipe picker in the form panel

One recipe prefills straight away; several become a pick-one list so the
review-first single-form flow survives multi-recipe chats."
```

---

### Task 4: Manual smoke test (human-in-the-loop)

**Files:** none — verification only. Requires the user's real `ANTHROPIC_API_KEY`; a subagent cannot complete this alone.

- [ ] **Step 1: Local or prod smoke**

Either locally (`.env` with the key, `npm run seed`, `npm run all`, `http://localhost:5173/#/new`) or in prod after deploy:

1. Paste a recipe-site URL (e.g. a food-blog recipe) → Extract from URL → form prefills (single) or picker appears (several) → Save works.
2. Paste the Claude share link (`https://claude.ai/share/92cd0832-04fb-4fe9-99c8-7f55ba2c3a9d`) → either recipes extract (web_fetch can read share pages — record this!) or the message "couldn't read that page — copy the recipe text instead" appears (record that too — it settles the spec's open question).
3. Paste a URL to a page with no recipes (e.g. a news article) → "no recipe found in that input".
4. Text and photo import still work (regression: they now go through the list path).

- [ ] **Step 2: Record the share-link verdict**

Note the outcome of 2 in the spec's Risks section (one line: readable or not) in a follow-up docs commit, so the panel copy can be tuned later if share links are confirmed unreadable.
