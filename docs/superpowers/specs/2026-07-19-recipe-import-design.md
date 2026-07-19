# recipe-book — Recipe import from text or photo — Design

*2026-07-19*

## Context

Creating a recipe today means typing every field by hand. Most of our recipes
already exist somewhere — a website, a note, a photo of a handwritten card or a
cookbook page. This feature lets the New Recipe screen accept pasted text or an
uploaded photo, has Claude extract the structured fields, and prefills the
existing form for review before saving. Nothing is auto-created; the human
always reviews and hits Save.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Flow | Prefill the New Recipe form, review, then normal Save | Extraction mistakes are cheap to fix before anything is stored |
| Source image | Extraction input only, discarded after | A card/page photo is rarely a good recipe photo; the photo picker stays a separate choice |
| Field scope | Title, summary, ingredients, instructions, category | Claude picks a category from the existing names (or none); everything is reviewable |
| Wiring | New `POST /api/extract` on the existing Express app | Key stays server-side; reuses Cognito writeAuth, DI, and test patterns; no new infra |
| Image transport | Base64 JPEG inline in the JSON body | Client already downscales to ≤1600px JPEG (~≤1MB base64) — far under Lambda's 6MB cap; no S3 round trip or orphan cleanup |
| Model | `claude-opus-4-8`, single non-streaming call | Vision + structured outputs in one request; adaptive thinking for hard handwriting |
| Output shape | Strict JSON schema via `output_config.format` | Guaranteed parseable; `found: false` cleanly signals "no recipe in this input" |

## API

`POST /api/extract` — auth: Cognito JWT (same `writeAuth` as all writes).

Request body, exactly one of:

```json
{ "text": "<pasted recipe text>" }
{ "image": "<base64 jpeg>", "mediaType": "image/jpeg" }
```

Responses:

| Status | Meaning |
|---|---|
| 200 | `{ title, summary, ingredients: string[], instructions: string[], categoryId: number \| null }` |
| 400 | Malformed payload (neither/both of text+image, wrong types, `mediaType` ≠ `image/jpeg`) |
| 422 | Input contains no recognizable recipe (`found: false` from the model) |
| 502 | Anthropic call failed (details logged server-side only) |
| 503 | Extraction not configured (no `ANTHROPIC_API_KEY`) |

The route mounts `express.json({ limit: "10mb" })` for this path only; the
global 1MB limit is unchanged. Claude returns a category *name* chosen from the
existing category list (or null); the route resolves it to `categoryId` by
name, mirroring the external importer's match-or-null behavior.

## Extraction module

`src/extract.ts`, following the `Presigner` pattern:

```ts
export interface Extractor {
  extract(input: ExtractInput): Promise<ExtractedRecipe>;
}
```

- `createClaudeExtractor({ apiKey })` is the one real implementation, using
  `@anthropic-ai/sdk`: a single non-streaming `messages.create` to
  `claude-opus-4-8` with `thinking: { type: "adaptive" }`,
  `max_tokens: 16000`, the image as a base64 content block (or the pasted
  text), the current category names in the prompt, and a strict JSON schema
  (`output_config.format`, `json_schema`): `{ found: boolean, title, summary,
  ingredients: string[], instructions: string[], category: string | null }`.
- `createApp` gains `extractor?: Extractor | null`; absent → 503, exactly like
  `presigner`. Tests inject a stub — no network, no key.
- `config.ts` gains `anthropicApiKey` (`ANTHROPIC_API_KEY`); `local.ts` and
  `lambda.ts` construct the real extractor only when the key is set;
  `template.yaml` passes the env var through.

## Frontend

Import UI appears only when creating (not editing). At the top of
`RecipeForm`: an "Import from text or photo" section with a textarea for
pasted text, a photo file button, and an Extract action.

- A photo pick reuses `downscaleToJpeg` before base64-encoding — uploads are
  small and always JPEG.
- While extracting: "Reading recipe…" and the form disables.
- On success: extracted values overwrite the form state (title, summary,
  categoryId, ingredients/instructions joined with newlines) and the panel
  collapses; the user reviews and uses the normal Save.
- `web/src/api.js` gains `extractRecipe(payload)`.
- Errors map to plain messages in the existing error paragraph: 422 →
  "Couldn't find a recipe in that input", 503 → "Import isn't configured",
  anything else → "Extraction failed — try again".

## Testing

vitest + supertest with a stubbed extractor injected through `createApp`,
matching the presigner/verifier test style — deterministic, no network:

- 401 unauthenticated; 503 extractor absent; 400 payload validation.
- 200 happy path for text and for image, including category-name → id
  matching and no-match → null.
- 422 on `found: false`; 502 when the stub throws.

The real Claude extractor stays a thin wrapper (prompt + schema construction)
with no automated test; one manual smoke test against the live API before
deploy. The Anthropic SDK's built-in retries (2× on 429/5xx) are relied on
as-is.

## Risks

- Base64 inflates the image ~1.37×; the client-side downscale keeps requests
  ≈≤1MB. If a payload ever exceeds the 10MB route limit, Express returns 413
  and the client shows the generic failure message.
- Extraction cost is per-use and small (one vision call per import); no
  caching or batching is warranted at household scale.
- `ANTHROPIC_API_KEY` is a new secret in Lambda env config — it lives in SAM
  parameters like the existing secrets, never in the repo.
