# recipe-book — Recipe import from URLs — Design

*2026-07-19*

## Context

Import today accepts pasted text or a photo. The household's recipes often live
at URLs — above all Claude chat share links where a recipe was developed in
conversation, but also ordinary recipe sites. This feature adds a URL input to
the import panel, extracts **one or more** recipes from the page, and lets the
user pick one to prefill the form. The review-first principle is unchanged:
nothing is created without a human hitting Save.

## Feasibility findings (probed 2026-07-19)

Claude share pages are not server-fetchable by us: the HTML is an empty SPA
shell (14KB, zero content), and the JSON endpoint behind it
(`/api/chat_snapshots/<id>`) sits behind a Cloudflare challenge. The design
therefore delegates fetching to Anthropic's server-side `web_fetch` tool and
treats "page unreadable" as a first-class outcome with a copy-paste fallback
message. Whether `web_fetch` itself can read share pages is settled by the
prod smoke test; the implementation is identical either way.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| URL scope | Any http(s) URL | Same mechanism covers Claude chats and recipe sites; no allowlist to maintain |
| Fetching | Anthropic `web_fetch_20260209` server tool, `max_uses: 3`, `allowed_domains` locked to the pasted URL's host | Zero fetch/scrape code in the Lambda; domain lock keeps the model from wandering |
| Multi-recipe | Extraction returns a list; UI picker prefills one | Keeps review-first single-form flow; second recipe = paste URL again after saving |
| Response shape | `{ recipes: [...] }` for **all** input modes (text/photo return one-element lists) | One contract, one client path; replaces the `found` boolean |
| Unreadable vs empty | Two distinct 422 messages | "Copy the text instead" guidance only when fetching failed |
| Lambda timeout | 15s → 60s | Fetch + extraction won't reliably fit in 15s |
| Version skew | Accept brief SPA/API skew during deploy | Two-user app; not worth versioning the endpoint |

## API

`POST /api/extract` (auth unchanged: Cognito writeAuth). Body, exactly one of:

```json
{ "text": "<pasted recipe text>" }
{ "image": "<base64 jpeg>", "mediaType": "image/jpeg" }
{ "url": "https://..." }
```

- `url` must parse as an absolute http/https URL → else 400.

Responses:

| Status | Meaning |
|---|---|
| 200 | `{ recipes: [{ title, summary, ingredients: string[], instructions: string[], categoryId: number \| null }, …] }` (≥1 entries) |
| 400 | Malformed payload (not exactly one input, wrong types, bad URL, `mediaType` ≠ `image/jpeg`) |
| 422 | Fetch failed: `"couldn't read that page — copy the recipe text instead"`; or nothing found: `"no recipe found in that input"` |
| 502 | Anthropic call failed (logged server-side) |
| 503 | Extraction not configured |

Category resolution is per-recipe, same name→id-or-null matching as today.

## Extraction module

`src/extract.ts` changes:

- `ExtractInput` gains `url?: string` (still exactly one of text/image/url plus
  `categoryNames`).
- `ExtractionResult` (replaces single `ExtractedRecipe` at the interface):
  `{ pageUnreadable: boolean, recipes: ExtractedRecipe[] }` where
  `ExtractedRecipe` is `{ title, summary, ingredients, instructions,
  category }` (no more `found`). The JSON schema mirrors this;
  `pageUnreadable` is defined as "true only when a URL was given and its
  content could not be retrieved".
- URL mode adds `tools: [{ type: "web_fetch_20260209", name: "web_fetch",
  max_uses: 3, allowed_domains: [<host of url>] }]` and the prompt instructs:
  fetch the URL first, then extract **every** distinct recipe found.
- Server tools introduce two mechanics, both inside the wrapper:
  - `stop_reason === "pause_turn"`: append the assistant turn and re-send,
    bounded at 5 continuations (then throw → 502).
  - The transcript contains tool blocks; parse the **last** text block, not
    the first.
- Model, thinking, max_tokens, structured output config: unchanged from the
  existing extractor.

## Frontend

Import panel (create mode only, as today):

- New URL row above the textarea: `<input type="url">` + "Extract from URL"
  button. All affordances share the `importing` state and disable together.
- Success with one recipe: prefill + collapse (today's behavior).
- Success with several: panel swaps to "Found N recipes:" with one button per
  title; clicking prefills + collapses. The list is component state only —
  after Save the user pastes the URL again for the next one.
- Errors: server messages shown verbatim in the existing error paragraph.
- `api.extractRecipe` is unchanged (same endpoint, new body key).

## Testing

Route tests (stubbed extractor, offline, as today) — migrated to the list
shape plus new cases:

- 400: bad/non-http URL, url+text both present, existing malformed cases.
- 200: multi-recipe response maps per-recipe categoryId (one match, one null);
  text and photo cases updated to one-element lists.
- 422: `pageUnreadable: true` → the copy-paste message; empty `recipes` →
  the no-recipe message.
- Stub asserts the url is passed through to `ExtractInput`.

The Claude wrapper (web_fetch config, pause_turn loop, last-text-block parse)
stays untested per the thin-wrapper rule; the prod smoke test — a real recipe
site URL and the user's Claude share link — is the live verification.

## Risks

- `web_fetch` may not read claude.ai share pages (likely, given the SPA
  shell). The failure mode is designed in: specific 422 + copy-paste
  guidance. If the smoke test confirms it, the panel's placeholder copy can
  mention it up front in a follow-up tweak.
- Some recipe sites block Anthropic's fetcher; same 422 path applies.
- Response-shape change breaks a stale SPA for the minutes between Lambda
  and Amplify deploys; accepted.
- 60s Lambda timeout raises the worst-case billed duration per request;
  bounded by auth (only the two of us can invoke extraction).
