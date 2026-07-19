# recipe-book

A recipe app for two, styled after [Highball](https://www.studioneat.com/blogs/main/17985764-introducing-highball):
a scrollable grid of colorful recipe cards with search and category filtering.
Anyone can browse; only we can write — via the web UI (Cognito) or a
bearer-secret import API for automation.

React 19 + Vite SPA on AWS Amplify Hosting · Express 5 on Lambda · Turso (libSQL) ·
photos on S3 via presigned uploads.

## Local dev

```sh
npm install && npm install --prefix web
cp .env.example .env
npm run seed   # schema + sample recipes into data/recipe-book.db
npm run all    # API :4181 + web :5173
```

No AWS credentials or Docker needed locally — without Cognito/S3 env vars, writes
run as user `dev` and photos land in `data/photos/`.

Design: [docs/superpowers/specs/2026-07-19-recipe-book-design.md](docs/superpowers/specs/2026-07-19-recipe-book-design.md)
· Deploy runbook: [docs/deploy.md](docs/deploy.md)
