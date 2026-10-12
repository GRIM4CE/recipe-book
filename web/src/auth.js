// Direct calls to Cognito's REST API — the aws-amplify SDK is enormous and we
// need only a handful of operations. Tokens live in localStorage; the API
// verifies the access token server-side on every write.

const region = import.meta.env.VITE_COGNITO_REGION;
const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;
const KEY = 'recipe-book-auth';

// Without a configured Cognito client the app is in local dev: any login is
// accepted here and the API's dev-bypass runs writes as user "dev".
export const devMode = !clientId;

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

function save(session) {
  if (session) localStorage.setItem(KEY, JSON.stringify(session));
  else localStorage.removeItem(KEY);
}

async function cognito(target, body) {
  const res = await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': `AWSCognitoIdentityProviderService.${target}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.__type || 'Sign-in failed');
  return data;
}

export function currentUser() {
  return load()?.username ?? null;
}

// Holds { username, session } between requestEmailCode and submitEmailCode.
let pendingEmail = null;

function finish(username, result) {
  save({
    username,
    accessToken: result.AccessToken,
    refreshToken: result.RefreshToken,
    expiresAt: Date.now() + result.ExpiresIn * 1000,
  });
  return username;
}

export function loginAsDev(username) {
  save({ username, accessToken: 'dev', refreshToken: null, expiresAt: Date.now() + 86_400_000 });
  return username;
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

export function logout() {
  save(null);
}

export async function getAccessToken() {
  const session = load();
  if (!session) return null;
  if (devMode || Date.now() < session.expiresAt - 60_000) return session.accessToken;
  if (!session.refreshToken) {
    save(null);
    return null;
  }
  try {
    const out = await cognito('InitiateAuth', {
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      ClientId: clientId,
      AuthParameters: { REFRESH_TOKEN: session.refreshToken },
    });
    const result = out.AuthenticationResult;
    save({
      ...session,
      accessToken: result.AccessToken,
      expiresAt: Date.now() + result.ExpiresIn * 1000,
    });
    return result.AccessToken;
  } catch {
    save(null);
    return null;
  }
}
