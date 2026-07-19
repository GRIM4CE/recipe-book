# Passwordless sign-in: passkeys + email-code fallback

Date: 2026-07-19
Status: approved (design), pending implementation

## Problem

Sign-in today is Cognito username + password (`USER_PASSWORD_AUTH`). The two
household users want no passwords at all: sign in with the device itself
(Face ID / fingerprint), stay signed in per device for ~a year, and have a
self-service way back in when a phone is lost or replaced.

## Decision

Native Cognito passwordless (Essentials tier), two first factors:

- **Passkey (WebAuthn)** — primary. Biometric prompt, phishing-resistant,
  bound to the production web origin.
- **Email one-time code** — bootstrap for first-time passkey registration and
  recovery on new devices. Never used in day-to-day sign-in.
- **Password sign-in is disabled** (not offered as a factor).

Implementation extends the existing hand-rolled Cognito REST client
(`web/src/auth.js`); no AWS SDK is introduced. Alternatives considered and
rejected: aws-amplify SDK (huge dependency the client deliberately avoids),
Cognito hosted login pages (generic UI + redirect flow + extra domain).

## Privacy constraint (hard rule)

No personal data in this repo: no email addresses, no usernames, no
production domain. The passkey relying-party ID is derived in CI from the
`WEB_ORIGIN` repo variable (scheme stripped). Account emails are entered only
via CloudShell by the operator. Docs use placeholders (`<email>`,
`https://<your-domain>`).

## Changes

### 1. Infrastructure — `template.yaml`, `.github/workflows/deploy-api.yml`

- `UserPool`:
  - `UserPoolTier: ESSENTIALS`
  - `Policies.SignInPolicy.AllowedFirstAuthFactors: [WEB_AUTHN, EMAIL_OTP]`
  - `WebAuthnRelyingPartyID: !Ref WebAuthnRpId` (new parameter),
    `WebAuthnUserVerification: required`
  - keeps `AllowAdminCreateUserOnly: true`; `UserPoolName` untouched so the
    update is in-place (no replacement, existing users preserved once created)
- `UserPoolClient`:
  - `ExplicitAuthFlows: [ALLOW_USER_AUTH, ALLOW_REFRESH_TOKEN_AUTH]`
    (drops `ALLOW_USER_PASSWORD_AUTH`)
  - `RefreshTokenValidity: 365`, `TokenValidityUnits.RefreshToken: days`
- New template parameter `WebAuthnRpId` (no default with real data; CI passes
  `${WEB_ORIGIN#https://}`).
- Email codes use Cognito's built-in mailer (sufficient at household volume).
- The API is untouched: same user pool, same JWTs, same verification.

### 2. Web client — `web/src/auth.js`

New/changed exports (REST calls, `USER_AUTH` flow):

- `loginWithPasskey(username)` — `InitiateAuth` with
  `PREFERRED_CHALLENGE: WEB_AUTHN` → `CREDENTIAL_REQUEST_OPTIONS` →
  `navigator.credentials.get()` → `RespondToAuthChallenge`.
- `loginWithEmailCode(username)` / `submitEmailCode(code)` — same flow with
  `PREFERRED_CHALLENGE: EMAIL_OTP`; session token held between the two calls.
- `registerPasskey()` — authenticated `StartWebAuthnRegistration` →
  `navigator.credentials.create()` → `CompleteWebAuthnRegistration`; sets a
  local "this device has a passkey" flag.
- base64url ⇄ ArrayBuffer helpers (WebAuthn payloads).
- Unchanged: token storage shape, refresh logic, dev-bypass when
  `VITE_COGNITO_CLIENT_ID` is absent.

### 3. Login UI — `web/src/components/Login.jsx` (+ small App hook-in)

- Username → passkey attempt (biometric prompt).
- "Email me a code instead" link → code entry field (bootstrap/recovery
  path). WebAuthn cancel/absence falls back here with a friendly message.
- After an email-code sign-in on a device without the passkey flag: banner
  "Add a passkey to this device" → `registerPasskey()` → flag set, banner
  gone.

### 4. Runbook — `docs/deploy.md`

Replace the create-user section: accounts are created with a verified email
and no usable password —

```sh
aws cognito-idp admin-create-user --user-pool-id <pool> --username <name> \
  --user-attributes Name=email,Value=<email> Name=email_verified,Value=true \
  --message-action SUPPRESS --region <region>
aws cognito-idp admin-set-user-password --user-pool-id <pool> \
  --username <name> --password "$(openssl rand -base64 24)" --permanent \
  --region <region>
```

(The random permanent password exists only to clear Cognito's
FORCE_CHANGE_PASSWORD state; the password factor is disabled so it can never
be used to sign in.)

## Error handling

- Passkey prompt cancelled / no credential on device → automatic offer of the
  email-code path.
- Wrong/expired email code → Cognito error surfaced in the form; user can
  re-request.
- Refresh-token expiry (>365 days idle) → normal sign-in, which is one
  biometric tap.

## Testing

- Unit (vitest, `web/`): base64url round-trip helpers; challenge→response
  shaping with a stubbed `navigator.credentials`.
- The `USER_AUTH` protocol calls are exercised against stubbed `fetch`
  responses (happy path + fallback path).
- End-to-end must run on the deployed HTTPS origin (WebAuthn refuses plain
  HTTP and mismatched RP IDs); local development keeps the dev-bypass and
  needs no Cognito.

## Rollout

1. Deploy infra + web (normal push-triggered pipelines).
2. Operator creates the two accounts via CloudShell (emails entered there,
   never committed).
3. Each phone: sign in once with an email code → accept "Add a passkey".
4. Verify: passkey sign-in on both phones; write UI appears; email path only
   ever needed again for a brand-new device.

## Risks / notes

- CloudFormation must update the pool in place — all listed pool/client
  changes are non-replacing. Anything that would force replacement is out of
  scope.
- Cognito's built-in mailer has a small daily cap — irrelevant at two users.
- Tokens remain in localStorage; unchanged posture from today, acceptable for
  this app's blast radius.
- Passkeys sync across a user's own devices via iCloud Keychain / Google
  Password Manager, so phone upgrades usually keep working without the email
  path.
