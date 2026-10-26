import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// auth.js touches localStorage and fetch — neither exists in the node test
// environment. Minimal stand-ins:
function stubGlobals() {
  const store = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  });
  vi.stubGlobal('fetch', vi.fn());
}

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
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
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
  });

  it('rejects submitEmailCode without a pending request', async () => {
    const auth = await freshAuth();
    await expect(auth.submitEmailCode('123456')).rejects.toThrow(/request a code/i);
  });
});

describe('logout', () => {
  async function signedIn() {
    const auth = await freshAuth();
    fetchReturns({ ChallengeName: 'EMAIL_OTP', Session: 's' }, { AuthenticationResult: TOKENS });
    await auth.requestEmailCode('alex');
    await auth.submitEmailCode('123456');
    return auth;
  }

  it('revokes the refresh token and clears the session', async () => {
    const auth = await signedIn();
    fetchReturns({});

    await auth.logout();

    const revoke = JSON.parse(fetch.mock.calls[2][1].body);
    expect(fetch.mock.calls[2][1].headers['X-Amz-Target']).toMatch(/RevokeToken$/);
    expect(revoke.Token).toBe('rt');
    expect(revoke.ClientId).toBe('client-1');
    expect(auth.currentUser()).toBeNull();
  });

  it('still clears the session when the revoke call fails', async () => {
    const auth = await signedIn();
    globalThis.fetch.mockRejectedValueOnce(new Error('offline'));

    await expect(auth.logout()).resolves.toBeUndefined();
    expect(auth.currentUser()).toBeNull();
  });
});

describe('loginAsDev', () => {
  it('stores a session that currentUser returns', async () => {
    const auth = await freshAuth();
    expect(auth.loginAsDev('alex')).toBe('alex');
    expect(auth.currentUser()).toBe('alex');
    expect(await auth.getAccessToken()).toBe('dev');
  });
});
