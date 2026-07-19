# recipe-book — Design

*2026-07-19*

## Context

A recipe app for two people, styled after Studio Neat's Highball: a scrollable grid
of colorful portrait recipe cards with search and category filtering. It doubles as
a public portfolio piece — anyone can browse, but writes are locked to the two of us
(web UI) and to a private automation that pushes recipes over an authenticated
import API.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Hosting | AWS: Amplify Hosting (SPA) + Lambda (API) + Turso (db) | Public + locked down without exposing any home infrastructure; ~$0/month |
| Frontend | React 19 + Vite, plain CSS | Small, familiar stack; no framework weight a two-person app doesn't need |
| Backend | Express 5 (TS, ESM); `serverless-http` on Lambda, plain server in dev | Same app runs in both environments |
| Database | Turso (hosted libSQL); `file:` URL locally | SQLite semantics, no persistent-disk problem on Lambda, zero Docker in dev |
| UI auth | Cognito user pool, self-signup disabled, two admin-created accounts | Real auth without storing passwords ourselves; "added by" attribution |
| API auth | Bearer secret on `/api/external/*` | Simple, sufficient over HTTPS for a single trusted importer |
| Categories | Managed list, one per recipe, category color drives card color | Highball-like chips + colorful cards with a single source of color |
| Search | Fully client-side over the complete recipe list | Household scale (~hundreds max); instant-as-you-type UX; one fetch |

## Architecture

- **Repo layout** (no workspaces): root = TS Express API (`src/`, `tests/`),
  `web/` = independent React/Vite app, `template.yaml` (SAM) at root.
- **Request path (prod):** browser → Amplify CDN (static SPA) → Lambda Function URL
  (Express) → Turso. Photos: browser/importer → S3 directly via presigned PUT.
- **Dependency injection:** `createApp({ db, verifier, presigner, externalSecret })` —
  tests stub the JWT verifier and presigner; the Lambda entry and local entry differ
  only in which libsql client and env they pass.

## Data model

Single idempotent schema (embedded string), applied at startup/seed. Hard deletes.

```sql
categories(id, name UNIQUE, color, created_at)
recipes(id, title, summary, ingredients /* JSON string[] */,
        instructions /* JSON string[] */, category_id → categories,
        photo_key, created_by, source /* 'web' | 'import' */,
        created_at, updated_at)
```

- Ingredients/instructions are ordered string lists edited whole and never queried
  relationally → JSON columns, not child tables.
- No users table: Cognito is the user store; `created_by` holds the username claim.
- Deleting a category referenced by recipes → 409.

## API

| Route | Auth |
|---|---|
| `GET /healthz`, `GET /api/recipes(/:id)`, `GET /api/categories` | public |
| `POST/PUT/DELETE /api/recipes(/:id)` | Cognito JWT |
| `POST/PUT/DELETE /api/categories(/:id)` | Cognito JWT |
| `POST /api/uploads` (presign) | Cognito JWT |
| `POST /api/external/recipes`, `POST /api/external/uploads` | bearer secret |

- JWT verification via `aws-jwt-verify` against the **access** token.
- Dev bypass: when Cognito env is absent and not production, writes run as user `dev`.
- External recipes: payload `{ title, summary?, ingredients[], instructions[],
  createdBy?, category?, photoKey? }`; category matches by name or is left null;
  rows are stamped `source: 'import'`.

## Photos

Single optional photo per recipe. `POST /api(/external)/uploads` returns a presigned
S3 PUT (server-generated key `photos/<uuid>.jpg`, pinned content-type, 5-minute
expiry). The browser downscales to ≤1600px JPEG via canvas before upload, so photo
bytes never transit Lambda (sidesteps the ~6MB payload limit and image processing on
Lambda). Serving: public `s3:GetObject` on `photos/*`; CloudFront is the documented
upgrade path, not the starting point. Local dev (`S3_BUCKET` unset): direct PUT to
disk under `data/photos/`, served back by the dev server.

## Frontend

Hash routing (`#/`, `#/recipes/:id`, `#/new`, `#/recipes/:id/edit`, `#/login`,
`#/categories`) via a small `useHashRoute` hook — no SPA rewrite rules needed on
Amplify. No aws-amplify SDK: `web/src/auth.js` calls Cognito's REST API directly
(`InitiateAuth` USER_PASSWORD_AUTH + refresh), tokens in localStorage.

Components: `RecipeGrid` (search input, category chips, card grid), `RecipeCard`
(portrait ~3:4, category-color background, photo top, big title — the Highball look),
`RecipeDetail`, `RecipeForm` (dynamic ingredient/step rows, photo pick + canvas
resize + presigned PUT), `Login`, `Categories` (CRUD with preset palette swatches).
One hand-written `styles.css` with custom properties and dark mode. Search/filter
logic lives in `web/src/filter.js` so it is unit-testable.

**PWA:** installable on phones — `manifest.webmanifest` (standalone display, theme
color, icons), a small hand-written `sw.js` (cache-first for static assets,
network-first for `/api`), and iOS home-screen meta + apple-touch-icon. Amplify
serves over HTTPS, which PWAs require.

## Importer contract

The private automation that pushes recipes:

- Authenticates every call with `Authorization: Bearer <EXTERNAL_API_SECRET>`.
- Optionally presigns a photo upload via `POST /api/external/uploads`, PUTs the
  image, then includes the returned `photoKey`.
- Creates recipes via `POST /api/external/recipes`; a photo failure should degrade
  to a photo-less recipe on the importer's side, and importer failures must never
  affect this app.

## Provisioning & deploy

One SAM `template.yaml`: Lambda (esbuild, nodejs22.x) + Function URL (no API
Gateway), Cognito pool (`AllowAdminCreateUserOnly: true`) + secretless app client
(`ALLOW_USER_PASSWORD_AUTH` + refresh), S3 photos bucket + public-read policy on
`photos/*`. Amplify Hosting is connected via console (app root `web`) with a
committed `amplify.yml`. Runbook in `docs/deploy.md`: Turso setup, `sam deploy`,
`admin-create-user` + `admin-set-user-password --permanent`, Amplify env vars.

## Testing

vitest + supertest against a temp `file:` libsql db per test file. Integration tests
cover: recipes/categories CRUD incl. 401s and the 409-in-use case, external endpoint
(secret validation, payload validation, category match-or-null), uploads presign in
local mode. Unit tests: auth middleware (stubbed verifier), payload validation,
`filter.js`. All deterministic — no network, S3 and JWT verifier injected.

## Risks

- `@libsql/client` native binding vs esbuild → Lambda entry imports
  `@libsql/client/web`; db client stays injected.
- Cognito: admin-created users are stuck in `FORCE_CHANGE_PASSWORD` until
  `admin-set-user-password --permanent`; app client must be secretless; verify the
  access token, not the id token.
- CORS in Express only; Function URL CORS must stay off (duplicate headers).
- Bucket needs `BlockPublicPolicy: false` for the public-read policy to apply.
- `VITE_*` vars are build-time — set in Amplify before the first build.
- Express 5 catch-alls use `/*splat` (path-to-regexp v8); smoke-test
  `serverless-http` early (fallback: `@codegenie/serverless-express`).
