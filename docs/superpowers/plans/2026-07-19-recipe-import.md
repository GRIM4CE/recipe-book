# Recipe Import from Text or Photo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the New Recipe screen, paste text or upload a photo of a recipe; Claude extracts the fields and prefills the existing form for review before the normal Save.

**Architecture:** One new Cognito-protected `POST /api/extract` route on the existing Express app. An `Extractor` interface is injected into `createApp` exactly like `presigner` (absent → 503); the one real implementation calls Claude (`claude-opus-4-8`, vision + strict JSON schema). The frontend adds an import panel to `RecipeForm` that posts to the route and writes the result into the existing form state. Spec: `docs/superpowers/specs/2026-07-19-recipe-import-design.md`.

**Tech Stack:** TypeScript ESM (Node ≥22), Express 5, `@anthropic-ai/sdk`, vitest + supertest, React 19 (plain JS, no TS in `web/`).

## Global Constraints

- All backend imports use explicit `.js` extensions (ESM, `"type": "module"`).
- Model string is exactly `claude-opus-4-8` — never a date-suffixed variant.
- Tests are deterministic: no network, extractor always stubbed; each test file gets its own temp `file:` libsql db (copy the `tests/uploads.test.ts` setup shape).
- Only one new dependency: `@anthropic-ai/sdk` (root `package.json`). Nothing new in `web/`.
- The repo is public. `ANTHROPIC_API_KEY` exists only in `.env` (gitignored), GitHub Actions secrets, and the SAM parameter — never in committed code.
- Commit style: concise, why-focused, one logical change per commit (see `.claude/conventions.md`). Never `--no-verify`.
- Run commands from the repo root: `npm test`, `npm run typecheck`, `npm test --prefix web`.

---

### Task 1: `POST /api/extract` route with injected extractor

**Files:**
- Create: `src/extract.ts` (types only in this task)
- Create: `tests/extract.test.ts`
- Modify: `src/app.ts` (options at `src/app.ts:11-28`, middleware order at `src/app.ts:101-110`, helpers near `parseCategoryInput` at `src/app.ts:89-99`)

**Interfaces:**
- Consumes: `createApp(opts)` from `src/app.ts`, `requireUser` (`writeAuth`) behavior from `src/auth.ts`, `db.listCategories()` / `db.getCategoryByName(name)` from `src/db.ts`.
- Produces (later tasks rely on these exact names):
  - `src/extract.ts`: `interface ExtractInput { text?: string; image?: string; categoryNames: string[] }`, `interface ExtractedRecipe { found: boolean; title: string; summary: string; ingredients: string[]; instructions: string[]; category: string | null }`, `interface Extractor { extract(input: ExtractInput): Promise<ExtractedRecipe> }`.
  - `createApp` option `extractor?: Extractor | null`.
  - Route contract: `POST /api/extract` body `{ text }` or `{ image, mediaType: "image/jpeg" }` → 200 `{ title, summary, ingredients, instructions, categoryId }`, else 400/401/422/502/503.

- [ ] **Step 1: Create the extraction seam types**

Create `src/extract.ts`:

```ts
// Extraction seam: turns pasted text or a photographed recipe into structured
// fields. Injected into createApp like the presigner — tests use a stub, prod
// uses the Claude-backed implementation (added in the next task).
export interface ExtractInput {
  text?: string;
  // Base64 JPEG bytes (no data: prefix).
  image?: string;
  // Existing category names so the model picks one of ours or none.
  categoryNames: string[];
}

export interface ExtractedRecipe {
  // false when the input did not contain a recipe.
  found: boolean;
  title: string;
  summary: string;
  ingredients: string[];
  instructions: string[];
  // A category name from categoryNames, or null.
  category: string | null;
}

export interface Extractor {
  extract(input: ExtractInput): Promise<ExtractedRecipe>;
}
```

- [ ] **Step 2: Write the failing tests**

Create `tests/extract.test.ts`:

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
```

- [ ] **Step 3: Run the new tests to verify they fail**

Run: `npx vitest run tests/extract.test.ts`
Expected: FAIL — `createApp` has no `extractor` option (TS error) and/or every request 404s.

- [ ] **Step 4: Implement the route in `src/app.ts`**

Four edits:

(a) Add to the imports at the top:

```ts
import type { ExtractedRecipe, Extractor } from "./extract.js";
```

(b) Add to `AppOptions` (after the `externalSecret` field):

```ts
  // Turns pasted text or a recipe photo into structured fields. Absent →
  // extraction is disabled (503).
  extractor?: Extractor | null;
```

(c) Add this helper after `parseCategoryInput` (module level):

```ts
function parseExtractInput(
  body: unknown,
): { text: string } | { image: string } | string {
  if (typeof body !== "object" || body === null) return "body must be an object";
  const b = body as Record<string, unknown>;
  if ((b.text === undefined) === (b.image === undefined)) {
    return "provide exactly one of text or image";
  }
  if (b.text !== undefined) {
    if (typeof b.text !== "string" || !b.text.trim()) {
      return "text must be a non-empty string";
    }
    return { text: b.text };
  }
  if (typeof b.image !== "string" || !b.image) {
    return "image must be a base64 string";
  }
  if (b.mediaType !== "image/jpeg") return "mediaType must be image/jpeg";
  return { image: b.image };
}
```

(d) Reorder the top of `createApp` and add the route. Replace:

```ts
  app.use(cors(opts.webOrigin ?? ""));
  app.use(express.json({ limit: "1mb" }));

  const writeAuth = requireUser({
    verifier: opts.verifier ?? null,
    isProduction: opts.isProduction ?? false,
  });
```

with:

```ts
  app.use(cors(opts.webOrigin ?? ""));

  const writeAuth = requireUser({
    verifier: opts.verifier ?? null,
    isProduction: opts.isProduction ?? false,
  });

  // Registered before the global 1mb parser: the body carries a base64
  // image, so this route parses its own body with a larger cap.
  app.post(
    "/api/extract",
    express.json({ limit: "10mb" }),
    writeAuth,
    async (req, res) => {
      if (!opts.extractor) {
        res.status(503).json({ error: "recipe extraction is not configured" });
        return;
      }
      const input = parseExtractInput(req.body);
      if (typeof input === "string") {
        res.status(400).json({ error: input });
        return;
      }
      const categories = await db.listCategories();
      let result: ExtractedRecipe;
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
      if (!result.found) {
        res.status(422).json({ error: "no recipe found in that input" });
        return;
      }
      const category = result.category
        ? await db.getCategoryByName(result.category)
        : null;
      res.json({
        title: result.title,
        summary: result.summary,
        ingredients: result.ingredients,
        instructions: result.instructions,
        categoryId: category?.id ?? null,
      });
    },
  );

  app.use(express.json({ limit: "1mb" }));
```

Why the ordering: the global `express.json({ limit: "1mb" })` would otherwise reject large extract bodies before the route's own parser runs. The route terminates its requests, so the global parser never touches them; all other routes are unaffected. (A >10MB body errors in the route parser and surfaces through the existing `onError` handler as a JSON error — unreachable in practice because the client downscales first. Leave `onError` untouched.)

- [ ] **Step 5: Run the new tests to verify they pass**

Run: `npx vitest run tests/extract.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Run the full suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: all existing tests still green; no TS errors.

- [ ] **Step 7: Commit**

```bash
git add src/extract.ts src/app.ts tests/extract.test.ts
git commit -m "feat: /api/extract route behind write auth

Extraction is a seam like the presigner: injected, 503 when absent, so
tests stay offline and a keyless deploy fails loudly."
```

---

### Task 2: Claude extractor and configuration wiring

**Files:**
- Modify: `src/extract.ts` (append the real implementation)
- Modify: `package.json` (via `npm install @anthropic-ai/sdk`)
- Modify: `src/config.ts` (interface at `src/config.ts:3-28`, loader at `src/config.ts:30-53`)
- Modify: `src/local.ts:19-37` and `src/lambda.ts:19-36` (the `createApp` call)
- Modify: `template.yaml` (Parameters block at `template.yaml:5-20`, Lambda env at `template.yaml:35-44`)
- Modify: `.github/workflows/deploy-api.yml:54-72` (sam deploy step)
- Modify: `.env.example`, `docs/deploy.md` (secrets table at `docs/deploy.md:118-125`, post-deploy checklist at `docs/deploy.md:190-198`)

**Interfaces:**
- Consumes: `Extractor`, `ExtractInput`, `ExtractedRecipe` from Task 1.
- Produces: `createClaudeExtractor(opts: { apiKey: string }): Extractor` from `src/extract.ts`; `Config.anthropicApiKey: string` from `src/config.ts`.

- [ ] **Step 1: Install the SDK**

Run: `npm install @anthropic-ai/sdk`
Expected: dependency added to root `package.json` + lockfile.

- [ ] **Step 2: Add the Claude implementation to `src/extract.ts`**

Add at the top of the file:

```ts
import Anthropic from "@anthropic-ai/sdk";
```

Append after the `Extractor` interface:

```ts
// Strict response schema; found:false is the model's clean way of saying
// "this input isn't a recipe" instead of hallucinating fields.
const RECIPE_SCHEMA = {
  type: "object",
  properties: {
    found: {
      type: "boolean",
      description: "false when the input does not contain a recipe",
    },
    title: { type: "string" },
    summary: { type: "string", description: "one short line about the dish" },
    ingredients: { type: "array", items: { type: "string" } },
    instructions: { type: "array", items: { type: "string" } },
    category: {
      anyOf: [{ type: "string" }, { type: "null" }],
      description: "one of the provided category names, or null",
    },
  },
  required: [
    "found",
    "title",
    "summary",
    "ingredients",
    "instructions",
    "category",
  ],
  additionalProperties: false,
};

function buildPrompt(input: ExtractInput): string {
  const source = input.image
    ? "Read the recipe in the attached image (it may be handwritten, a cookbook page, or a screenshot)."
    : "Extract the recipe from the text below.";
  return [
    "Extract this recipe into structured data for a recipe app.",
    source,
    "Rules:",
    "- ingredients: one entry per ingredient, quantities as written.",
    "- instructions: one entry per step, without step numbers.",
    "- summary: one short line describing the dish.",
    `- category: the best fit among [${input.categoryNames.join(", ")}], or null if none fits.`,
    "- If the input does not contain a recipe, set found to false and leave every other field empty.",
    ...(input.text ? ["", input.text] : []),
  ].join("\n");
}

export function createClaudeExtractor(opts: { apiKey: string }): Extractor {
  const client = new Anthropic({ apiKey: opts.apiKey });
  return {
    async extract(input) {
      const content: Anthropic.ContentBlockParam[] = [];
      if (input.image) {
        content.push({
          type: "image",
          source: { type: "base64", media_type: "image/jpeg", data: input.image },
        });
      }
      content.push({ type: "text", text: buildPrompt(input) });
      const response = await client.messages.create({
        model: "claude-opus-4-8",
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        output_config: {
          format: { type: "json_schema", schema: RECIPE_SCHEMA },
        },
        messages: [{ role: "user", content }],
      });
      const text = response.content.find(
        (b): b is Anthropic.TextBlock => b.type === "text",
      );
      if (!text) {
        throw new Error(
          `no text block in response (stop_reason: ${response.stop_reason})`,
        );
      }
      return JSON.parse(text.text) as ExtractedRecipe;
    },
  };
}
```

Notes for the implementer: this module intentionally has no automated test (thin wrapper per spec) — the route tests from Task 1 cover everything above this seam. If `output_config` or a type name doesn't typecheck against the installed SDK version, fix from the compiler error (the SDK exports `Anthropic.ContentBlockParam` / `Anthropic.TextBlock`; do not add zod).

- [ ] **Step 3: Add the key to `src/config.ts`**

In the `Config` interface, after `externalEnabled: boolean;`:

```ts
  // Anthropic API key for recipe import extraction. Empty = extraction
  // disabled (the route 503s).
  anthropicApiKey: string;
```

In `loadConfig()`'s returned object, after `externalEnabled: Boolean(externalApiSecret),`:

```ts
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
```

- [ ] **Step 4: Wire the extractor in both entries**

In `src/local.ts` and `src/lambda.ts`, add to the import list:

```ts
import { createClaudeExtractor } from "./extract.js";
```

and add to the `createApp({ ... })` options in both files (after `externalSecret`):

```ts
  extractor: config.anthropicApiKey
    ? createClaudeExtractor({ apiKey: config.anthropicApiKey })
    : null,
```

- [ ] **Step 5: Thread the parameter through SAM and CI**

`template.yaml` — add to `Parameters`:

```yaml
  AnthropicApiKey:
    Type: String
    NoEcho: true
    Default: ''
    Description: Anthropic API key for recipe import extraction (empty disables it)
```

and to the Lambda's `Environment.Variables`:

```yaml
          ANTHROPIC_API_KEY: !Ref AnthropicApiKey
```

`.github/workflows/deploy-api.yml` — in the `sam deploy` step, add to `env`:

```yaml
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

and to the `--parameter-overrides` list:

```
              "AnthropicApiKey=$ANTHROPIC_API_KEY" \
```

- [ ] **Step 6: Document the env var**

`.env.example` — append:

```
# Anthropic API key for recipe import (New Recipe → import from text/photo).
# Empty disables extraction (the API returns 503).
ANTHROPIC_API_KEY=
```

`docs/deploy.md` — add a row to the Secrets table:

```
| `ANTHROPIC_API_KEY` | console.anthropic.com key for recipe import extraction (optional) |
```

and a post-deploy checklist item:

```
- [ ] New Recipe → paste recipe text → Extract prefills the form (proves ANTHROPIC_API_KEY)
```

- [ ] **Step 7: Verify build health**

Run: `npm test && npm run typecheck`
Expected: all green (no new tests in this task; typecheck exercises the new module and wiring).

- [ ] **Step 8: Commit**

```bash
git add src/extract.ts src/config.ts src/local.ts src/lambda.ts template.yaml .github/workflows/deploy-api.yml .env.example docs/deploy.md package.json package-lock.json
git commit -m "feat: Claude-backed recipe extractor behind ANTHROPIC_API_KEY

Key absent means the seam stays null and the route 503s, matching how
Cognito and S3 degrade in dev."
```

---

### Task 3: Import panel in the New Recipe form

**Files:**
- Modify: `web/src/api.js:36-63` (the `api` object)
- Modify: `web/src/image.js` (append helper)
- Modify: `web/src/components/RecipeForm.jsx`
- Modify: `web/src/styles.css` (near the existing form styles)

**Interfaces:**
- Consumes: `POST /api/extract` contract from Task 1 (`{ text }` or `{ image, mediaType: "image/jpeg" }` → `{ title, summary, ingredients, instructions, categoryId }`; server error strings are user-presentable); `downscaleToJpeg(file)` from `web/src/image.js`; `authed()` pattern in `web/src/api.js`.
- Produces: `api.extractRecipe(data)`, `blobToBase64(blob)`.

- [ ] **Step 1: Add the API call**

In `web/src/api.js`, after the `uploadPhoto` entry:

```js
  // Turn pasted text or a photographed recipe into prefilled form fields.
  extractRecipe: (data) => authed('/api/extract', { method: 'POST', body: json(data) }),
```

- [ ] **Step 2: Add the base64 helper**

Append to `web/src/image.js`:

```js
// Base64 payload (without the data: prefix) for JSON transport to the
// extraction API.
export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',', 2)[1]);
    reader.onerror = () => reject(new Error('Could not read image data'));
    reader.readAsDataURL(blob);
  });
}
```

- [ ] **Step 3: Add the import panel to `RecipeForm.jsx`**

Update the import at the top:

```js
import { blobToBase64, downscaleToJpeg } from '../image.js';
```

Add state after the existing `busy` state (`web/src/components/RecipeForm.jsx:26`):

```js
  // Import panel: only offered when creating, collapses after a successful
  // extraction.
  const [showImport, setShowImport] = useState(!recipe);
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
```

Add handlers after `removePhoto()`:

```js
  async function runImport(payload) {
    setImporting(true);
    setError(null);
    try {
      const extracted = await api.extractRecipe(payload);
      setTitle(extracted.title);
      setSummary(extracted.summary);
      setCategoryId(extracted.categoryId ?? '');
      setIngredients(extracted.ingredients.join('\n'));
      setInstructions(extracted.instructions.join('\n'));
      setImportText('');
      setShowImport(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  }

  async function importFromPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setError(null);
    try {
      const blob = await downscaleToJpeg(file);
      const image = await blobToBase64(blob);
      await runImport({ image, mediaType: 'image/jpeg' });
    } catch (err) {
      setError(err.message);
    }
  }
```

Add the panel JSX directly after the `<h2>` line, before the Title label:

```jsx
      {!recipe &&
        (showImport ? (
          <div className="import-panel">
            <span className="field-title">Import from text or photo</span>
            <textarea
              rows={4}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="Paste a recipe from anywhere…"
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
            Import from text or photo
          </button>
        ))}
```

Disable Save while an import runs — change the submit button's `disabled={busy}` to:

```jsx
disabled={busy || importing}
```

Error display needs no work: `runImport` reuses the existing `setError`/`<p className="error">`, and the server's messages ("no recipe found in that input", "recipe extraction is not configured", "extraction failed") are already user-presentable, matching how the rest of the form surfaces API errors.

- [ ] **Step 4: Style the panel**

In `web/src/styles.css`, next to the existing form/photo-field styles, add (match the file's spacing conventions if they differ):

```css
/* Import panel (New Recipe) */

.import-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px dashed var(--line);
  border-radius: 10px;
  background: var(--paper);
}
```

- [ ] **Step 5: Verify web build health**

Run: `npm test --prefix web`
Expected: existing filter tests pass (no new unit tests — the panel is UI glue; the contract is covered by Task 1's route tests).

Then start `npm run all`, open `http://localhost:5173/#/new` (dev bypass — no sign-in needed), and with **no** `ANTHROPIC_API_KEY` set confirm: the panel renders, "Extract from text" with pasted text shows the error "recipe extraction is not configured". That proves the full client → route wiring without a key.

- [ ] **Step 6: Commit**

```bash
git add web/src/api.js web/src/image.js web/src/components/RecipeForm.jsx web/src/styles.css
git commit -m "feat: import-from-text-or-photo panel on New Recipe

Prefills the existing form fields for review instead of auto-creating,
so extraction mistakes die in the form, not in the database."
```

---

### Task 4: Manual smoke test (human-in-the-loop)

**Files:** none — verification only. Requires the user's real `ANTHROPIC_API_KEY`; a subagent cannot complete this task alone.

- [ ] **Step 1: Configure the key locally**

Add the real key to `.env` (`ANTHROPIC_API_KEY=sk-ant-…`). Never commit it.

- [ ] **Step 2: Smoke the three paths**

With `npm run all` running, on `http://localhost:5173/#/new`:

1. Paste a real recipe's text → Extract from text → all five fields prefill, category matches one of the seeded categories or is None → Save works.
2. Upload a photo of a printed or handwritten recipe → Extract from photo → fields prefill sensibly.
3. Paste non-recipe text (e.g. a news paragraph) → "no recipe found in that input".
4. Confirm `data/photos/` gained no files (the source image is never stored).

- [ ] **Step 3: Production follow-up (record, don't do now)**

Before the next `main` deploy, add the `ANTHROPIC_API_KEY` secret in GitHub → repo Settings → Secrets and variables → Actions, per the updated `docs/deploy.md`.

---

## Self-review notes

- Spec coverage: route + statuses (Task 1), model/schema/prompt + config/SAM/CI wiring (Task 2), panel/UX/errors (Task 3), manual smoke (Task 4). The spec's "413 on oversized body" risk surfaces via the existing `onError` handler instead (client copy identical); noted inline in Task 1 Step 4.
- Type consistency: `ExtractInput.categoryNames` is required and supplied by the route (`{ ...input, categoryNames }`); the 200 body's `categoryId` matches what `RecipeForm` consumes.
- Client error copy relies on server messages (matches the form's existing `err.message` pattern) rather than status-code mapping — a deliberate simplification of the spec's wording, same content.
