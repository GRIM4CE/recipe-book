import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useLanguage } from '../useLanguage.jsx';
import LanguageSwitch from './LanguageSwitch.jsx';

function Invite() {
  const { t } = useLanguage();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [invited, setInvited] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api.inviteUser({ username: username.trim(), email: email.trim() });
      setInvited(created.username);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setUsername('');
    setEmail('');
    setInvited(null);
  }

  return (
    <div className="settings-section">
      <p className="settings-label">{t('inviteTitle')}</p>
      {invited ? (
        <>
          <p>{t('invited', { name: invited })}</p>
          <ol className="invite-steps">
            <li>{t('inviteStep1', { url: `${window.location.origin}/#/login` })}</li>
            <li>{t('inviteStep2', { name: invited })}</li>
            <li>{t('inviteStep3')}</li>
            <li>{t('inviteStep4')}</li>
          </ol>
          <button className="btn ghost" type="button" onClick={reset}>
            {t('inviteAnother')}
          </button>
        </>
      ) : (
        <form className="form" onSubmit={submit}>
          <p className="hint">{t('inviteHint')}</p>
          <label>
            {t('username')}
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
              required
            />
          </label>
          <label>
            {t('email')}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? t('inviting') : t('invite')}
          </button>
        </form>
      )}
    </div>
  );
}

export default function Settings({ user, onSignOut }) {
  const { t } = useLanguage();
  const [canInvite, setCanInvite] = useState(false);

  // A failed lookup just leaves the invite section out.
  useEffect(() => {
    let live = true;
    api
      .me()
      .then((me) => live && setCanInvite(Boolean(me.canInvite)))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="settings-page">
      <h2>{t('settings')}</h2>
      <div className="settings-section">
        <p className="settings-label">{t('signedInAs')}</p>
        <p className="settings-user">{user}</p>
      </div>
      <div className="settings-section">
        <p className="settings-label">{t('language')}</p>
        <LanguageSwitch />
      </div>
      {canInvite && <Invite />}
      <button className="btn danger" type="button" onClick={onSignOut}>
        {t('signOut')}
      </button>
    </div>
  );
}
