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

Variables:

| Variable | Value |
|---|---|
| `AWS_ROLE_ARN` | the role ARN echoed by the setup above |
| `WEB_ORIGIN` | leave unset for now — filled in at step 4 |

### First deploy + smoke test

Push to `main` (or Actions → deploy-api → Run workflow), wait for green, then:

```sh
aws cloudformation describe-stacks --stack-name recipe-book \
  --query 'Stacks[0].Outputs' --output table
# outputs: ApiUrl, UserPoolId, UserPoolClientId, PhotosBucketName

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

Set the `WEB_ORIGIN` GitHub Actions **variable** to the Amplify URL
(`https://main.<app-id>.amplifyapp.com`, no trailing slash), then re-run the
deploy: Actions → deploy-api → Run workflow.

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
- CI is the deploy path. A local `sam deploy` still works in a pinch (you'd
  need the parameter values); `samconfig.toml` stays gitignored because
  parameter overrides include secrets.
- Cost expectation: Lambda + Cognito + S3 at household traffic ≈ $0; Amplify
  Hosting pennies/month; Turso free tier.
