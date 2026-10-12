import { useState } from 'react';
import { devMode, loginAsDev, requestEmailCode, submitEmailCode } from '../auth.js';
import { useLanguage } from '../useLanguage.jsx';

export default function Login({ onLogin }) {
  const { t } = useLanguage();
  const [username, setUsername] = useState('');
  const [mode, setMode] = useState('email'); // 'email' | 'code'
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
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    const name = username.trim();
    if (devMode) {
      finish(loginAsDev(name));
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
      <h2>{t('signIn')}</h2>
      {devMode && <p className="hint">{t('devHint')}</p>}
      <label>
        {t('loginName')}
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          disabled={mode === 'code'}
          required
        />
      </label>
      {mode === 'code' && (
        <label>
          {t('emailCode')}
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
        {busy ? t('signingIn') : devMode || mode === 'code' ? t('signIn') : t('emailMeCode')}
      </button>
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
          {t('sendNewCode')}
        </button>
      )}
    </form>
  );
}
