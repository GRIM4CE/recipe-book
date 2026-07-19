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
      if (err.code === 'NO_PASSKEY') setMode('email');
      setError(err.message);
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
        <button
          className="btn ghost small"
          type="button"
          onClick={() => {
            setMode('email');
            setError(null);
          }}
        >
          Email me a code instead
        </button>
      )}
      {mode === 'code' && (
        <button
          className="btn ghost small"
          type="button"
          onClick={() => {
            setMode('email');
            setCode('');
            setError(null);
          }}
        >
          Send a new code
        </button>
      )}
    </form>
  );
}
