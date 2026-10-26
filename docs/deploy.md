# Deploy runbook

Three pieces: Turso (database), SAM (API + Cognito + S3), Amplify Hosting (web).
Order matters on first deploy: Turso → SAM → Amplify → one more API deploy to
whitelist the Amplify origin for CORS.

The API deploys from GitHub Actions, not your machine. Prereqs: AWS CLI
(authenticated — only for the one-time IAM setup and Cognito user creation),
Turso CLI.

## 1. Turso

```sh
turso db create recipe-book
turso db show recipe-book --url          # → DB_URL (libsql://…)
turso db tokens create recipe-book       # → DB_AUTH_TOKEN
```

No schema step needed — the Lambda applies the idempotent schema on cold start.

## 2. API stack (SAM via GitHub Actions)

Every push to `main` that touches `src/`, `template.yaml`, or the root
lockfile runs `.github/workflows/deploy-api.yml`: tests, `sam build`,
`sam deploy`. Parameter values come from GitHub Actions secrets/variables;
AWS access uses OIDC (no stored AWS keys). The stack region lives in the
workflow's `env` block.

### One-time: IAM role for GitHub OIDC

```sh
# GitHub's OIDC identity provider (fails harmlessly if it already exists)
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Role only this repo's main branch can assume
cat > /tmp/trust.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "arn:aws:iam::${ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        "token.actions.githubusercontent.com:sub": "repo:GRIM4CE/recipe-book:ref:refs/heads/main"
      }
    }
  }]
}
EOF
aws iam create-role --role-name recipe-book-deploy \
  --assume-role-policy-document file:///tmp/trust.json

# Scoped to the stack's own resources
cat > /tmp/deploy-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "cloudformation:*",
      "Resource": [
        "arn:aws:cloudformation:*:${ACCOUNT_ID}:stack/recipe-book/*",
        "arn:aws:cloudformation:*:${ACCOUNT_ID}:stack/aws-sam-cli-managed-default/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": "cloudformation:CreateChangeSet",
      "Resource": "arn:aws:cloudformation:*:aws:transform/Serverless-2016-10-31"
    },
    {
      "Effect": "Allow",
      "Action": ["cloudformation:GetTemplateSummary", "cloudformation:ValidateTemplate"],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::aws-sam-cli-managed-default*",
        "arn:aws:s3:::recipe-book-*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": "lambda:*",
      "Resource": "arn:aws:lambda:*:${ACCOUNT_ID}:function:recipe-book-*"
    },
    { "Effect": "Allow", "Action": "cognito-idp:*", "Resource": "*" },
    {
      "Effect": "Allow",
      "Action": [
        "iam:CreateRole", "iam:DeleteRole", "iam:GetRole", "iam:PassRole",
        "iam:AttachRolePolicy", "iam:DetachRolePolicy",
        "iam:PutRolePolicy", "iam:DeleteRolePolicy", "iam:GetRolePolicy",
        "iam:TagRole", "iam:UntagRole",
        "iam:ListRolePolicies", "iam:ListAttachedRolePolicies"
      ],
      "Resource": "arn:aws:iam::${ACCOUNT_ID}:role/recipe-book-*"
    }
  ]
}
EOF
aws iam put-role-policy --role-name recipe-book-deploy \
  --policy-name deploy --policy-document file:///tmp/deploy-policy.json

echo "AWS_ROLE_ARN: arn:aws:iam::${ACCOUNT_ID}:role/recipe-book-deploy"
```

### GitHub → repo Settings → Secrets and variables → Actions

Secrets:

| Secret | Value |
|---|---|
| `DB_URL` | `turso db show recipe-book --url` |
| `DB_AUTH_TOKEN` | `turso db tokens create recipe-book` |
| `EXTERNAL_API_SECRET` | `openssl rand -hex 32` — the importer needs this same value |
| `ANTHROPIC_API_KEY` | console.anthropic.com key for recipe import extraction (optional) |

Variables:

| Variable | Value |
|---|---|
| `AWS_ROLE_ARN` | the role ARN echoed by the setup above |
| `WEB_ORIGIN` | leave unset for now — filled in at step 4 |
| `ADMIN_USERNAMES` | your Cognito username; comma-separate several. Who may invite from the app |

### First deploy + smoke test

Push to `main` (or Actions → deploy-api → Run workflow), wait for green, then:

```sh
aws cloudformation describe-stacks --stack-name recipe-book \
  --query 'Stacks[0].Outputs' --output table
# outputs: ApiUrl, UserPoolId, UserPoolClientId, PhotosBucketName

curl <ApiUrl>/healthz                    # {"ok":true}
curl <ApiUrl>/api/recipes                # {"recipes":[]}
```

### Create accounts

Sign-in is by email code, so each account needs a verified email and no
usable password (a random one is set, which only clears Cognito's initial
challenge state; the app client has no password flow).

Set `ADMIN_USERNAMES` to your username (then deploy once), sign in, open
Settings → Invite someone, enter just their email; their sign-in name is that
email (lowercased), and the page offers to send them the instructions. On
first sign-in each person picks a username, which is what recipes and the
People list show; sign-in stays by email. Your own account, the first one,
has to come from the CLI below, since nobody can invite before an admin
exists. Settings also lists everyone who has an account.

The CLI alternative is `npm run add-user -- <name> <email>`; pass the email
for both (`npm run add-user -- <email> <email>`) to get the same result as the
in-app invite. It reads
`USER_POOL_ID` from the environment, or looks it up from the stack outputs
above, and runs `admin-create-user` (verified email, `--message-action
SUPPRESS`) then `admin-set-user-password --permanent`: the same two calls the
app makes.

The sign-in icon is in the app's header (or open `<app url>/#/login`). On
each device, the first and every later sign-in is the same: enter the name,
receive a code by email, enter it. The device then stays signed in.

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

Set the `WEB_ORIGIN` GitHub Actions **variable** to the Amplify URL
(`https://main.<app-id>.amplifyapp.com`, no trailing slash), then re-run the
deploy: Actions → deploy-api → Run workflow.

## 5. Importer

Give the pushing automation two env values: the API base URL (`ApiUrl` without
trailing slash) and the `EXTERNAL_API_SECRET`. Contract: optional
`POST /api/external/uploads` with `{ size }` (photo byte length, max 10 MB;
presign + PUT exactly that many bytes), then
`POST /api/external/recipes` with
`{ title, summary?, ingredients[], instructions[], category?, createdBy?, photoKey? }`
and header `Authorization: Bearer <secret>`. Unknown category names are
dropped, not created.

## Post-deploy checklist

- [ ] `curl <ApiUrl>/healthz` → `{"ok":true}`
- [ ] Amplify URL renders the (empty) grid — proves CORS
- [ ] Sign in as each account with an email code; anonymous visitors see no write UI
- [ ] Create a recipe with a photo — proves JWT, presign, public S3 read
- [ ] Recipe shows "Added by <account>" attribution
- [ ] `POST /api/external/recipes` with a wrong secret → 401; right secret → recipe appears
- [ ] Install the PWA on each phone (Share → Add to Home Screen)
- [ ] New Recipe → paste recipe text → Extract prefills the form (proves ANTHROPIC_API_KEY)
- [ ] New Recipe → paste a recipe-site URL → Extract prefills (or picker for several); a Claude share link either extracts or shows the copy-paste guidance
- [ ] Save a recipe in French, switch the app to English → it reads translated (proves translation). Bumping `TRANSLATION_RULES_VERSION` in `src/translate.ts` drops all stored translations on the next deploy; they are regenerated when someone next switches language

## Notes

- CloudFront in front of the photos bucket is the upgrade path if photo
  latency ever matters; S3 URLs are already HTTPS.
- CI is the deploy path. A local `sam deploy` still works in a pinch (you'd
  need the parameter values); `samconfig.toml` stays gitignored because
  parameter overrides include secrets.
- Translations are cached per recipe. When the translation prompt changes
  so that old ones are wrong, bump `TRANSLATION_RULES_VERSION`; the next cold
  start deletes every stored translation once and they regenerate on demand.
- Cost expectation: Lambda + Cognito + S3 at household traffic ≈ $0; Amplify
  Hosting pennies/month; Turso free tier.
