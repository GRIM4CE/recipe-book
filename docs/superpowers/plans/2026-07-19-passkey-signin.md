# Passkey + Email-Code Sign-in Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace username+password sign-in with passkeys (WebAuthn) as the primary factor and email one-time codes as bootstrap/recovery, per `docs/superpowers/specs/2026-07-19-passkey-signin-design.md`.

**Architecture:** The web app keeps its hand-rolled Cognito REST client; a new pure module converts between Cognito's WebAuthn JSON and the browser credentials API. The Cognito user pool moves to the Essentials tier with `USER_AUTH` choice-based sign-in. The API layer is untouched.

**Tech Stack:** React 19 + Vite (no auth SDK), vitest, Cognito `USER_AUTH` flow, SAM/CloudFormation.

## Global Constraints

- **No personal data in the repo**: no email addresses, usernames, or the production domain. RP ID reaches the template only via CI (`${WEB_ORIGIN#https://}`). Docs use `<email>` / `<name>` placeholders.
- No new frontend dependencies (`web/package.json` gains nothing).
- Existing exports of `web/src/auth.js` that survive (`devMode`, `currentUser`, `logout`, `getAccessToken`) keep their exact signatures — `api.js` and `App.jsx` depend on them.
- Cognito requires `PASSWORD` to remain in the pool's `AllowedFirstAuthFactors`; actual password sign-in is blocked by dropping `ALLOW_USER_PASSWORD_AUTH` from the app client.
- All commits run the privacy grep first: `git diff --cached | grep -inEf .git/info/privacy-grep` must match nothing. The pattern file lives inside `.git/` (never committed); recreate it from the private memory notes if missing.

---

### Task 1: WebAuthn payload helpers

**Files:**
- Create: `web/src/webauthn.js`
- Test: `web/tests/webauthn.test.js`

**Interfaces:**
- Produces: `b64urlToBuf(string) → ArrayBuffer`, `bufToB64url(ArrayBuffer|TypedArray) → string`, `toGetOptions(json) → CredentialRequestOptions`, `toCreateOptions(json) → CredentialCreationOptions`, `credentialToJson(PublicKeyCredential) → object` (Cognito's expected response shape). Task 2 imports all but the first two.

- [ ] **Step 1: Write the failing tests**

```js
// web/tests/webauthn.test.js
import { describe, expect, it } from 'vitest';
import {
  b64urlToBuf,
  bufToB64url,
  credentialToJson,
  toCreateOptions,
  toGetOptions,
} from '../src/webauthn.js';

describe('base64url', () => {
  it('round-trips values of every padding length', () => {
    for (const s of ['AQ', 'AQI', 'AQID', 'AQIDBA', '_-8', 'SGVsbG8']) {
      expect(bufToB64url(b64urlToBuf(s))).toBe(s);
    }
  });

  it('decodes url-safe alphabet', () => {
    expect(Array.from(new Uint8Array(b64urlToBuf('_-8')))).toEqual([255, 239]);
  });
});

describe('toGetOptions', () => {
  it('converts challenge and credential ids to buffers', () => {
    const out = toGetOptions({
      challenge: 'AQID',
      rpId: 'example.test',
      allowCredentials: [{ type: 'public-key', id: 'BAUG' }],
    });
    expect(Array.from(new Uint8Array(out.publicKey.challenge))).toEqual([1, 2, 3]);
    expect(Array.from(new Uint8Array(out.publicKey.allowCredentials[0].id))).toEqual([4, 5, 6]);
    expect(out.publicKey.rpId).toBe('example.test');
  });

  it('unwraps a publicKey envelope', () => {
    const out = toGetOptions({ publicKey: { challenge: 'AQID' } });
    expect(out.publicKey.challenge).toBeInstanceOf(ArrayBuffer);
  });
});

describe('toCreateOptions', () => {
  it('converts challenge and user id', () => {
    const out = toCreateOptions({
      challenge: 'AQID',
      rp: { id: 'example.test', name: 'x' },
      user: { id: 'BAUG', name: 'u', displayName: 'u' },
    });
    expect(out.publicKey.challenge).toBeInstanceOf(ArrayBuffer);
    expect(Array.from(new Uint8Array(out.publicKey.user.id))).toEqual([4, 5, 6]);
    expect(out.publicKey.user.name).toBe('u');
  });
});

describe('credentialToJson', () => {
  const buf = (...b) => Uint8Array.from(b).buffer;

  it('serializes an assertion (sign-in) credential', () => {
    const json = credentialToJson({
      id: 'cred-id',
      rawId: buf(1),
      type: 'public-key',
      authenticatorAttachment: 'platform',
      getClientExtensionResults: () => ({}),
      response: {
        clientDataJSON: buf(2),
        authenticatorData: buf(3),
        signature: buf(4),
        userHandle: null,
      },
    });
    expect(json).toEqual({
      id: 'cred-id',
      rawId: 'AQ',
      type: 'public-key',
      authenticatorAttachment: 'platform',
      clientExtensionResults: {},
      response: {
        clientDataJSON: 'Ag',
        authenticatorData: 'Aw',
        signature: 'BA',
        userHandle: null,
      },
    });
  });

  it('serializes a registration credential with transports', () => {
    const json = credentialToJson({
      id: 'cred-id',
      rawId: buf(1),
      type: 'public-key',
      getClientExtensionResults: () => ({}),
      response: {
        clientDataJSON: buf(2),
        attestationObject: buf(5),
        getTransports: () => ['internal'],
      },
    });
    expect(json.response.attestationObject).toBe('BQ');
    expect(json.response.transports).toEqual(['internal']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --prefix web -- webauthn`
Expected: FAIL — cannot resolve `../src/webauthn.js`

- [ ] **Step 3: Implement the module**

```js
// web/src/webauthn.js
// Cognito's WebAuthn JSON uses base64url for binary fields; the browser's
// credentials API wants ArrayBuffers. Everything here is that conversion.

export function b64urlToBuf(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export function bufToB64url(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function toGetOptions(json) {
  const pk = json.publicKey ?? json;
  return {
    publicKey: {
      ...pk,
      challenge: b64urlToBuf(pk.challenge),
      allowCredentials: (pk.allowCredentials ?? []).map((c) => ({
        ...c,
        id: b64urlToBuf(c.id),
      })),
    },
  };
}

export function toCreateOptions(json) {
  const pk = json.publicKey ?? json;
  return {
    publicKey: {
      ...pk,
      challenge: b64urlToBuf(pk.challenge),
      user: { ...pk.user, id: b64urlToBuf(pk.user.id) },
      excludeCredentials: (pk.excludeCredentials ?? []).map((c) => ({
        ...c,
        id: b64urlToBuf(c.id),
      })),
    },
  };
}

export function credentialToJson(cred) {
  const r = cred.response;
  const out = {
    id: cred.id,
    rawId: bufToB64url(cred.rawId),
    type: cred.type,
    clientExtensionResults: cred.getClientExtensionResults?.() ?? {},
    response: { clientDataJSON: bufToB64url(r.clientDataJSON) },
  };
  if (cred.authenticatorAttachment) out.authenticatorAttachment = cred.authenticatorAttachment;
  if (r.attestationObject) {
    out.response.attestationObject = bufToB64url(r.attestationObject);
    if (r.getTransports) out.response.transports = r.getTransports();
  }
  if (r.authenticatorData) {
    out.response.authenticatorData = bufToB64url(r.authenticatorData);
    out.response.signature = bufToB64url(r.signature);
    out.response.userHandle = r.userHandle ? bufToB64url(r.userHandle) : null;
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --prefix web -- webauthn`
Expected: PASS (all webauthn.test.js tests)

- [ ] **Step 5: Privacy grep + commit**

```bash
git add web/src/webauthn.js web/tests/webauthn.test.js
git diff --cached | grep -inEf .git/info/privacy-grep || \
  git commit -m "feat: webauthn payload helpers for cognito passkey flows"
```

---

### Task 2: USER_AUTH flows in auth.js

**Files:**
- Modify: `web/src/auth.js` (replace `login`; keep everything else)
- Test: `web/tests/auth.test.js` (new)

**Interfaces:**
- Consumes: Task 1's `toGetOptions`, `toCreateOptions`, `credentialToJson`.
- Produces (Task 3 uses these exact names):
  - `loginWithPasskey(username) → Promise<username>` — throws `err.code === 'NO_PASSKEY'` when the account/device has no usable passkey or the prompt is cancelled.
  - `requestEmailCode(username) → Promise<void>`
  - `submitEmailCode(code) → Promise<username>`
  - `registerPasskey() → Promise<void>` (requires signed-in session)
  - `hasDevicePasskey() → boolean`
  - unchanged: `devMode`, `currentUser`, `logout`, `getAccessToken`
- The old `login(username, password)` export is deleted; Task 3 removes its only caller.

- [ ] **Step 1: Write the failing tests**

```js
// web/tests/auth.test.js
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// auth.js touches localStorage, fetch, and navigator.credentials — none of
// which exist in the node test environment. Minimal stand-ins:
function stubGlobals() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  globalThis.navigator = { credentials: { get: vi.fn(), create: vi.fn() } };
  globalThis.fetch = vi.fn();
}

const CHALLENGE_JSON = JSON.stringify({ challenge: 'AQID', rpId: 'example.test', allowCredentials: [] });
const ASSERTION = {
  id: 'c1',
  rawId: Uint8Array.from([1]).buffer,
  type: 'public-key',
  getClientExtensionResults: () => ({}),
  response: {
    clientDataJSON: Uint8Array.from([2]).buffer,
    authenticatorData: Uint8Array.from([3]).buffer,
    signature: Uint8Array.from([4]).buffer,
    userHandle: null,
  },
};
const TOKENS = { AccessToken: 'at', RefreshToken: 'rt', ExpiresIn: 3600 };

function fetchReturns(...bodies) {
  for (const body of bodies) {
    globalThis.fetch.mockResolvedValueOnce({ ok: true, json: async () => body });
  }
}

async function freshAuth() {
  vi.resetModules();
  vi.stubEnv('VITE_COGNITO_REGION', 'us-east-1');
  vi.stubEnv('VITE_COGNITO_CLIENT_ID', 'client-1');
  return await import('../src/auth.js');
}

beforeEach(stubGlobals);
afterEach(() => vi.unstubAllEnvs());

describe('loginWithPasskey', () => {
  it('signs in via WEB_AUTHN challenge and stores the session', async () => {
    const auth = await freshAuth();
    fetchReturns(
      {
        ChallengeName: 'WEB_AUTHN',
        Session: 's1',
        ChallengeParameters: { CREDENTIAL_REQUEST_OPTIONS: CHALLENGE_JSON },
      },
      { AuthenticationResult: TOKENS },
    );
    navigator.credentials.get.mockResolvedValueOnce(ASSERTION);

    await expect(auth.loginWithPasskey('alex')).resolves.toBe('alex');

    const initiate = JSON.parse(fetch.mock.calls[0][1].body);
    expect(initiate.AuthFlow).toBe('USER_AUTH');
    expect(initiate.AuthParameters.PREFERRED_CHALLENGE).toBe('WEB_AUTHN');
    const respond = JSON.parse(fetch.mock.calls[1][1].body);
    expect(respond.ChallengeName).toBe('WEB_AUTHN');
    expect(respond.Session).toBe('s1');
    expect(JSON.parse(respond.ChallengeResponses.CREDENTIAL).rawId).toBe('AQ');
    expect(auth.currentUser()).toBe('alex');
    expect(auth.hasDevicePasskey()).toBe(true);
    expect(await auth.getAccessToken()).toBe('at');
  });

  it('throws NO_PASSKEY when the prompt is cancelled', async () => {
    const auth = await freshAuth();
    fetchReturns({
      ChallengeName: 'WEB_AUTHN',
      Session: 's1',
      ChallengeParameters: { CREDENTIAL_REQUEST_OPTIONS: CHALLENGE_JSON },
    });
    navigator.credentials.get.mockRejectedValueOnce(new DOMException('cancel', 'NotAllowedError'));

    await expect(auth.loginWithPasskey('alex')).rejects.toMatchObject({ code: 'NO_PASSKEY' });
    expect(auth.currentUser()).toBe(null);
  });

  it('throws NO_PASSKEY when Cognito offers a different challenge', async () => {
    const auth = await freshAuth();
    fetchReturns({ ChallengeName: 'EMAIL_OTP', Session: 's1' });
    await expect(auth.loginWithPasskey('alex')).rejects.toMatchObject({ code: 'NO_PASSKEY' });
  });
});

describe('email code flow', () => {
  it('requests a code then signs in with it', async () => {
    const auth = await freshAuth();
    fetchReturns(
      { ChallengeName: 'EMAIL_OTP', Session: 's-mail' },
      { AuthenticationResult: TOKENS },
    );

    await auth.requestEmailCode('alex');
    await expect(auth.submitEmailCode('123456')).resolves.toBe('alex');

    const respond = JSON.parse(fetch.mock.calls[1][1].body);
    expect(respond.ChallengeName).toBe('EMAIL_OTP');
    expect(respond.Session).toBe('s-mail');
    expect(respond.ChallengeResponses.EMAIL_OTP_CODE).toBe('123456');
    expect(auth.currentUser()).toBe('alex');
    expect(auth.hasDevicePasskey()).toBe(false);
  });

  it('rejects submitEmailCode without a pending request', async () => {
    const auth = await freshAuth();
    await expect(auth.submitEmailCode('123456')).rejects.toThrow(/request a code/i);
  });
});

describe('registerPasskey', () => {
  it('runs start → create → complete and marks the device', async () => {
    const auth = await freshAuth();
    fetchReturns(
      { ChallengeName: 'EMAIL_OTP', Session: 's-mail' },
      { AuthenticationResult: TOKENS },
      {
        CredentialCreationOptions: {
          challenge: 'AQID',
          rp: { id: 'example.test', name: 'rb' },
          user: { id: 'BAUG', name: 'alex', displayName: 'alex' },
        },
      },
      {},
    );
    await auth.requestEmailCode('alex');
    await auth.submitEmailCode('123456');

    navigator.credentials.create.mockResolvedValueOnce({
      id: 'c2',
      rawId: Uint8Array.from([9]).buffer,
      type: 'public-key',
      getClientExtensionResults: () => ({}),
      response: {
        clientDataJSON: Uint8Array.from([2]).buffer,
        attestationObject: Uint8Array.from([5]).buffer,
        getTransports: () => ['internal'],
      },
    });

    await auth.registerPasskey();

    const start = JSON.parse(fetch.mock.calls[2][1].body);
    expect(start.AccessToken).toBe('at');
    const complete = JSON.parse(fetch.mock.calls[3][1].body);
    expect(complete.Credential.rawId).toBe('CQ');
    expect(auth.hasDevicePasskey()).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --prefix web -- tests/auth`
Expected: FAIL — `loginWithPasskey` is not exported

- [ ] **Step 3: Implement in `web/src/auth.js`**

Delete the `login` function; add below `currentUser()`:

```js
import { credentialToJson, toCreateOptions, toGetOptions } from './webauthn.js';

const PASSKEY_FLAG = 'recipe-book-passkey';
// Holds { username, session } between requestEmailCode and submitEmailCode.
let pendingEmail = null;

export function hasDevicePasskey() {
  return localStorage.getItem(PASSKEY_FLAG) != null;
}

function finish(username, result) {
  save({
    username,
    accessToken: result.AccessToken,
    refreshToken: result.RefreshToken,
    expiresAt: Date.now() + result.ExpiresIn * 1000,
  });
  return username;
}

export async function loginWithPasskey(username) {
  if (devMode) {
    save({ username, accessToken: 'dev', refreshToken: null, expiresAt: Date.now() + 86_400_000 });
    return username;
  }
  const out = await cognito('InitiateAuth', {
    AuthFlow: 'USER_AUTH',
    ClientId: clientId,
    AuthParameters: { USERNAME: username, PREFERRED_CHALLENGE: 'WEB_AUTHN' },
  });
  if (out.ChallengeName !== 'WEB_AUTHN') {
    throw Object.assign(new Error('No passkey here yet — sign in with an email code instead.'), {
      code: 'NO_PASSKEY',
    });
  }
  let credential;
  try {
    credential = await navigator.credentials.get(
      toGetOptions(JSON.parse(out.ChallengeParameters.CREDENTIAL_REQUEST_OPTIONS)),
    );
  } catch (err) {
    throw Object.assign(new Error('Passkey prompt was cancelled.'), { code: 'NO_PASSKEY', cause: err });
  }
  const done = await cognito('RespondToAuthChallenge', {
    ChallengeName: 'WEB_AUTHN',
    ClientId: clientId,
    Session: out.Session,
    ChallengeResponses: {
      USERNAME: username,
      CREDENTIAL: JSON.stringify(credentialToJson(credential)),
    },
  });
  localStorage.setItem(PASSKEY_FLAG, '1');
  return finish(username, done.AuthenticationResult);
}

export async function requestEmailCode(username) {
  const out = await cognito('InitiateAuth', {
    AuthFlow: 'USER_AUTH',
    ClientId: clientId,
    AuthParameters: { USERNAME: username, PREFERRED_CHALLENGE: 'EMAIL_OTP' },
  });
  if (out.ChallengeName !== 'EMAIL_OTP') {
    throw new Error('Could not email a code for this account.');
  }
  pendingEmail = { username, session: out.Session };
}

export async function submitEmailCode(code) {
  if (!pendingEmail) throw new Error('Request a code first.');
  const done = await cognito('RespondToAuthChallenge', {
    ChallengeName: 'EMAIL_OTP',
    ClientId: clientId,
    Session: pendingEmail.session,
    ChallengeResponses: { USERNAME: pendingEmail.username, EMAIL_OTP_CODE: code },
  });
  const { username } = pendingEmail;
  pendingEmail = null;
  return finish(username, done.AuthenticationResult);
}

export async function registerPasskey() {
  const token = await getAccessToken();
  if (!token) throw new Error('Sign in first.');
  const start = await cognito('StartWebAuthnRegistration', { AccessToken: token });
  const credential = await navigator.credentials.create(
    toCreateOptions(start.CredentialCreationOptions),
  );
  await cognito('CompleteWebAuthnRegistration', {
    AccessToken: token,
    Credential: credentialToJson(credential),
  });
  localStorage.setItem(PASSKEY_FLAG, '1');
}
```

Also update the file's header comment ("exactly two operations" is no longer true — say "a handful of operations").

- [ ] **Step 4: Run the full web suite**

Run: `npm test --prefix web`
Expected: PASS (webauthn, auth, filter)

- [ ] **Step 5: Privacy grep + commit**

```bash
git add web/src/auth.js web/tests/auth.test.js
git diff --cached | grep -inEf .git/info/privacy-grep || \
  git commit -m "feat: passkey and email-code sign-in flows in the cognito client"
```

---

### Task 3: Login screen + add-passkey offer

**Files:**
- Modify: `web/src/components/Login.jsx` (full rewrite below)
- Modify: `web/src/App.jsx` (imports, one state hook, banner in `<main>`)

**Interfaces:**
- Consumes: Task 2's `loginWithPasskey`, `requestEmailCode`, `submitEmailCode`, `registerPasskey`, `hasDevicePasskey`, `devMode`.
- Produces: unchanged component contracts (`<Login onLogin={fn}>`; App renders it as before).

- [ ] **Step 1: Rewrite `Login.jsx`**

```jsx
import { useState } from 'react';
import { devMode, loginWithPasskey, requestEmailCode, submitEmailCode } from '../auth.js';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [mode, setMode] = useState('passkey'); // 'passkey' | 'email' | 'code'
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  function finish(user) {
    onLogin(user);
    window.location.hash = '#/';
  }

  async function run(fn) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      if (err.code === 'NO_PASSKEY') {
        setMode('email');
        setError(err.message);
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    const name = username.trim();
    if (mode === 'passkey') {
      await run(async () => finish(await loginWithPasskey(name)));
    } else if (mode === 'email') {
      await run(async () => {
        await requestEmailCode(name);
        setMode('code');
      });
    } else {
      await run(async () => finish(await submitEmailCode(code.trim())));
    }
  }

  return (
    <form className="form login-form" onSubmit={submit}>
      <h2>Sign in</h2>
      {devMode && (
        <p className="hint">Dev mode: any name signs you in, writes run as “dev”.</p>
      )}
      <label>
        Username
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username webauthn"
          disabled={mode === 'code'}
          required
        />
      </label>
      {mode === 'code' && (
        <label>
          Code from your email
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            required
          />
        </label>
      )}
      {error && <p className="error">{error}</p>}
      <button className="btn primary" type="submit" disabled={busy}>
        {busy
          ? 'Signing in…'
          : mode === 'passkey'
            ? 'Sign in with passkey'
            : mode === 'email'
              ? 'Email me a code'
              : 'Sign in'}
      </button>
      {!devMode && mode === 'passkey' && (
        <button className="btn ghost small" type="button" onClick={() => { setMode('email'); setError(null); }}>
          Email me a code instead
        </button>
      )}
      {mode === 'code' && (
        <button className="btn ghost small" type="button" onClick={() => { setMode('email'); setCode(''); setError(null); }}>
          Send a new code
        </button>
      )}
    </form>
  );
}
```

- [ ] **Step 2: Add the passkey offer to `App.jsx`**

Change the auth import line to:

```js
import { currentUser, devMode, hasDevicePasskey, logout, registerPasskey } from './auth.js';
```

Inside `App()`, after the `user` state:

```js
const [offerPasskey, setOfferPasskey] = useState(false);
useEffect(() => {
  setOfferPasskey(Boolean(user) && !devMode && !hasDevicePasskey());
}, [user]);

async function addPasskey() {
  try {
    await registerPasskey();
    setOfferPasskey(false);
  } catch (err) {
    window.alert(err.message);
  }
}
```

In the JSX, first thing inside `<main>`:

```jsx
<main>
  {offerPasskey && (
    <p className="notice">
      Add a passkey to sign in with just Face ID / fingerprint next time.{' '}
      <button className="btn primary small" type="button" onClick={addPasskey}>
        Add passkey
      </button>{' '}
      <button className="btn ghost small" type="button" onClick={() => setOfferPasskey(false)}>
        Not now
      </button>
    </p>
  )}
  {page}
</main>
```

- [ ] **Step 3: Verify build + suite**

Run: `npm test --prefix web && npm run build --prefix web`
Expected: tests PASS; vite build completes (catches syntax/import mistakes — there is no component-test infra in this repo)

- [ ] **Step 4: Privacy grep + commit**

```bash
git add web/src/components/Login.jsx web/src/App.jsx
git diff --cached | grep -inEf .git/info/privacy-grep || \
  git commit -m "feat: passkey-first login screen with email-code fallback and enrol banner"
```

---

### Task 4: User pool + pipeline config

**Files:**
- Modify: `template.yaml` (Parameters, UserPool, UserPoolClient)
- Modify: `.github/workflows/deploy-api.yml` (sam deploy step)

**Interfaces:**
- Produces: template parameter `WebAuthnRpId` (default `localhost`); CI passes the bare production domain derived from the `WEB_ORIGIN` variable. No code consumes new outputs.

- [ ] **Step 1: Template — add parameter**

After the `WebOrigin` parameter:

```yaml
  WebAuthnRpId:
    Type: String
    Default: localhost
    Description: Passkey relying-party ID (the web app's bare domain; CI derives it from WebOrigin)
```

- [ ] **Step 2: Template — user pool**

Replace the `UserPool` resource's `Properties` with:

```yaml
    Properties:
      UserPoolName: recipe-book-users
      # Essentials unlocks choice-based sign-in (passkeys + email OTP).
      UserPoolTier: ESSENTIALS
      WebAuthnRelyingPartyID: !Ref WebAuthnRpId
      WebAuthnUserVerification: required
      # The two accounts are created by the admin CLI; nobody can sign up.
      AdminCreateUserConfig:
        AllowAdminCreateUserOnly: true
      Policies:
        # Cognito insists PASSWORD stays in this list; the app client below
        # simply has no password flow, so it is unusable in practice.
        SignInPolicy:
          AllowedFirstAuthFactors: [PASSWORD, WEB_AUTHN, EMAIL_OTP]
        PasswordPolicy:
          MinimumLength: 12
          RequireLowercase: false
          RequireUppercase: false
          RequireNumbers: false
          RequireSymbols: false
```

- [ ] **Step 3: Template — app client**

Replace the `UserPoolClient` resource's `Properties` with:

```yaml
    Properties:
      UserPoolId: !Ref UserPool
      # No secret: the browser calls InitiateAuth directly.
      GenerateSecret: false
      ExplicitAuthFlows:
        - ALLOW_USER_AUTH
        - ALLOW_REFRESH_TOKEN_AUTH
      # A device stays signed in for a year; renewal is one biometric tap.
      RefreshTokenValidity: 365
      TokenValidityUnits:
        RefreshToken: days
```

- [ ] **Step 4: Workflow — pass the RP ID**

In the `sam deploy` step of `.github/workflows/deploy-api.yml`, change the run block to derive the RP ID from `WEB_ORIGIN` (empty → template default `localhost`):

```yaml
        run: |
          RP_ID="${WEB_ORIGIN#https://}"
          sam deploy \
            --stack-name recipe-book \
            --resolve-s3 \
            --capabilities CAPABILITY_IAM \
            --no-confirm-changeset \
            --no-fail-on-empty-changeset \
            --no-progressbar \
            --parameter-overrides \
              "DbUrl=$DB_URL" \
              "DbAuthToken=$DB_AUTH_TOKEN" \
              "ExternalApiSecret=$EXTERNAL_API_SECRET" \
              "WebOrigin=$WEB_ORIGIN" \
              "WebAuthnRpId=${RP_ID:-localhost}"
```

- [ ] **Step 5: Verify + commit**

Run: `npm run typecheck && npm test` (API untouched — proves no accidental breakage)
Expected: PASS

```bash
git add template.yaml .github/workflows/deploy-api.yml
git diff --cached | grep -inEf .git/info/privacy-grep || \
  git commit -m "feat: cognito essentials with passkey + email-otp sign-in, year-long refresh"
```

---

### Task 5: Runbook update

**Files:**
- Modify: `docs/deploy.md` (accounts section + checklist)

- [ ] **Step 1: Replace the "Create the two accounts" section with**

```markdown
### Create the two accounts

Sign-in is passkey-first with email codes as bootstrap/recovery, so each
account needs a verified email and no usable password (the random one below
only clears Cognito's initial challenge state; the app client has no
password flow):

```sh
aws cognito-idp admin-create-user \
  --user-pool-id <UserPoolId> --username <name> \
  --user-attributes Name=email,Value=<email> Name=email_verified,Value=true \
  --message-action SUPPRESS
aws cognito-idp admin-set-user-password \
  --user-pool-id <UserPoolId> --username <name> \
  --password "$(openssl rand -base64 24)" --permanent
```

First sign-in on each device: enter the username, choose “Email me a code
instead”, then accept the “Add a passkey” banner. After that it's Face
ID/fingerprint only. A lost phone just repeats this bootstrap.
```

- [ ] **Step 2: Update the post-deploy checklist lines about sign-in**

Replace `- [ ] Sign in as each account; anonymous visitors see no write UI` with:

```markdown
- [ ] Sign in as each account with an email code; anonymous visitors see no write UI
- [ ] Register a passkey on each phone; sign out and back in via passkey
```

- [ ] **Step 3: Privacy grep + commit**

```bash
git add docs/deploy.md
git diff --cached | grep -inEf .git/info/privacy-grep || \
  git commit -m "docs: passwordless account setup in deploy runbook"
```

---

### Task 6: Ship

- [ ] **Step 1: Full verification**

Run: `npm test && npm run typecheck && npm test --prefix web && npm run build --prefix web`
Expected: all PASS

- [ ] **Step 2: Spec status + final privacy sweep**

Update the spec's `Status:` line to `implemented`; then:

```bash
git add docs/superpowers/specs/2026-07-19-passkey-signin-design.md
git commit -m "docs: mark passkey design implemented"
git log main..HEAD -p | grep -inEf .git/info/privacy-grep
```
Expected: grep finds nothing across the whole branch diff.

- [ ] **Step 3: Merge to main and push (user waived PR/review checkpoints)**

```bash
git switch main && git merge --no-ff feat/passkey-signin -m "feat: passwordless sign-in (passkeys + email codes)" && git push origin main
```

Pushing main auto-deploys the API stack (template change) and Amplify rebuilds the web app.

- [ ] **Step 4: Watch the deploy, then hand the operator their CloudShell commands**

`gh run watch` the triggered `deploy-api` run. On success, give the operator the two `admin-create-user` / `admin-set-user-password` command pairs with real pool id and region filled in (emails supplied by the operator in CloudShell, never committed), plus the phone enrollment steps.
