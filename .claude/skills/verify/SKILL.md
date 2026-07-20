---
name: verify
description: Build, launch, and drive this app end-to-end to verify a change at its surface (React SPA + Express API).
---

# Verifying recipe-book changes

## Build & launch

```bash
npm install && npm install --prefix web   # fresh container only
npm run seed                              # schema + sample data → data/recipe-book.db
npm run all                               # API :4181 + Vite :5173 (run in background)
curl -s localhost:4181/healthz            # {"ok":true} when up
```

No AWS credentials or Docker needed locally: auth falls back to dev-bypass
(any username at `#/login` signs in as that user, token `dev`), photos go to
`data/photos/`.

## Drive it

- API surface: `curl localhost:4181/api/...` with `-H 'Authorization: Bearer dev'`
  for writes.
- UI surface: Playwright against `http://localhost:5173` with the pre-installed
  browser at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`
  (`chromium.launch({ executablePath: ... })`; the `playwright` npm package is
  not a repo dependency — install it in the scratchpad).
- Dev login flow: goto `#/login`, fill `.login-form input` with any name,
  click its submit button, wait for `a[href="#/new"]`.

## Gotchas

- Routing is hash-based (`#/new`, `#/recipes/12/edit`, `#/categories`).
- For a clean slate: kill the servers, `rm data/recipe-book.db`, reseed,
  relaunch — the API holds the SQLite file open.
