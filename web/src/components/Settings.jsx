import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useLanguage } from '../useLanguage.jsx';
import LanguageSwitch from './LanguageSwitch.jsx';

function Invite() {
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [invited, setInvited] = useState(null);
  const [note, setNote] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setInvited(await api.inviteUser({ email: email.trim() }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setEmail('');
    setInvited(null);
  }

  const message = invited
    ? t('inviteMessage', { url: `${window.location.origin}/#/login`, email: invited.email })
    : '';

  async function send() {
    try {
      if (navigator.share) {
        await navigator.share({ title: t('appName'), text: message });
        return;
      }
      await navigator.clipboard.writeText(message);
      setNote(t('inviteCopied'));
    } catch (err) {
      if (err?.name === 'AbortError') return; // user dismissed the share sheet
      setNote(t('shareFailed'));
    }
    setTimeout(() => setNote(''), 2000);
  }

  return (
    <div className="settings-section">
      <p className="settings-label">{t('inviteTitle')}</p>
      {invited ? (
        <>
          <p>{t('invited', { email: invited.email })}</p>
          <pre className="invite-message">{message}</pre>
          <div className="invite-actions">
            <button className="btn primary" type="button" onClick={send}>
              {t('sendInvite')}
            </button>
            {note && <span className="share-note">{note}</span>}
          </div>
          <button className="btn ghost" type="button" onClick={reset}>
            {t('inviteAnother')}
          </button>
        </>
      ) : (
        <form className="form" onSubmit={submit}>
          <p className="hint">{t('inviteHint')}</p>
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
