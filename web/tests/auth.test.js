import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// auth.js touches localStorage, fetch, and navigator.credentials — none of
// which exist in the node test environment. Minimal stand-ins:
function stubGlobals() {
  const store = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  });
  vi.stubGlobal('navigator', { credentials: { get: vi.fn(), create: vi.fn() } });
  vi.stubGlobal('fetch', vi.fn());
}

const CHALLENGE_JSON = JSON.stringify({
  challenge: 'AQID',
  rpId: 'example.test',
  allowCredentials: [],
});
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
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

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
