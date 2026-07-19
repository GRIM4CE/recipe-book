# Deploy runbook

Three pieces: Turso (database), SAM (API + Cognito + S3), Amplify Hosting (web).
Order matters on first deploy: Turso → SAM → Amplify → one SAM re-deploy to
whitelist the Amplify origin for CORS.

Prereqs: AWS CLI (authenticated), SAM CLI, Turso CLI.

## 1. Turso

```sh
turso db create recipe-book
turso db show recipe-book --url          # → DB_URL (libsql://…)
turso db tokens create recipe-book       # → DB_AUTH_TOKEN
```

No schema step needed — the Lambda applies the idempotent schema on cold start.

## 2. API stack (SAM)

```sh
openssl rand -hex 32                     # → EXTERNAL_API_SECRET, keep it safe
sam build
sam deploy --guided --stack-name recipe-book
# parameters: DbUrl, DbAuthToken, ExternalApiSecret; leave WebOrigin empty for now
```

Note the stack outputs: `ApiUrl`, `UserPoolId`, `UserPoolClientId`,
`PhotosBucketName`.

Smoke test:

```sh
curl <ApiUrl>/healthz                    # {"ok":true}
curl <ApiUrl>/api/recipes                # {"recipes":[]}
```

### Create the two accounts

Admin-created users start in FORCE_CHANGE_PASSWORD and cannot sign in through
the app until the password is made permanent — do both steps per user:

```sh
aws cognito-idp admin-create-user \
  --user-pool-id <UserPoolId> --username <name> --message-action SUPPRESS
aws cognito-idp admin-set-user-password \
  --user-pool-id <UserPoolId> --username <name> \
  --password '<password, 12+ chars>' --permanent
```

## 3. Web (Amplify Hosting)

In the Amplify console: **New app → Host web app**, connect this repo,
branch `main`. Amplify picks up `amplify.yml`; set the **app root** to `web`
(monorepo setting). Before the first build, add environment variables (they are
baked in at build time):

| Variable | Value |
|---|---|
| `VITE_API_BASE_URL` | `ApiUrl` output, **without** the trailing slash |
| `VITE_COGNITO_CLIENT_ID` | `UserPoolClientId` output |
| `VITE_COGNITO_REGION` | the stack's region, e.g. `us-east-1` |

Deploy, note the app URL (`https://main.….amplifyapp.com`).

## 4. Allow the web origin (CORS)

```sh
sam deploy --parameter-overrides WebOrigin=https://main.<app-id>.amplifyapp.com
# other parameters keep their previous values
```

## 5. Importer

Give the pushing automation two env values: the API base URL (`ApiUrl` without
trailing slash) and the `EXTERNAL_API_SECRET`. Contract: optional
`POST /api/external/uploads` (presign + PUT photo bytes), then
`POST /api/external/recipes` with
`{ title, summary?, ingredients[], instructions[], category?, createdBy?, photoKey? }`
and header `Authorization: Bearer <secret>`. Unknown category names are
dropped, not created.

## Post-deploy checklist

- [ ] `curl <ApiUrl>/healthz` → `{"ok":true}`
- [ ] Amplify URL renders the (empty) grid — proves CORS
- [ ] Sign in as each account; anonymous visitors see no write UI
- [ ] Create a recipe with a photo — proves JWT, presign, public S3 read
- [ ] Recipe shows "Added by <account>" attribution
- [ ] `POST /api/external/recipes` with a wrong secret → 401; right secret → recipe appears
- [ ] Install the PWA on both phones (Share → Add to Home Screen)

## Notes

- CloudFront in front of the photos bucket is the upgrade path if photo
  latency ever matters; S3 URLs are already HTTPS.
- `samconfig.toml` is gitignored because parameter overrides include secrets.
- Cost expectation: Lambda + Cognito + S3 at household traffic ≈ $0; Amplify
  Hosting pennies/month; Turso free tier.
