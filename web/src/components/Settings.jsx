import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useLanguage } from '../useLanguage.jsx';
import LanguageSwitch from './LanguageSwitch.jsx';

function Invite({ onInvited }) {
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [invited, setInvited] = useState(null);
  const [note, setNote] = useState('');
  // The invitation text, prefilled from the template and editable before it
  // is sent.
  const [message, setMessage] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api.inviteUser({ email: email.trim() });
      setInvited(created);
      setMessage(
        t('inviteMessage', { url: `${window.location.origin}/#/login`, email: created.email }),
      );
      onInvited();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setEmail('');
    setInvited(null);
    setMessage('');
  }

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
          <textarea
            className="invite-message"
            rows={9}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            aria-label={t('inviteTitle')}
          />
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

function People({ users }) {
  const { lang, t } = useLanguage();
  const dateFormat = new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="settings-section">
      <p className="settings-label">{t('peopleTitle')}</p>
      <ul className="people-list">
        {users.map((u) => (
          <li key={u.username}>
            <span>{u.displayName ?? u.email ?? u.username}</span>
            {u.displayName && <span className="hint">{u.email ?? u.username}</span>}
            <span className="hint">
              {t('joined', { date: dateFormat.format(new Date(u.createdAt)) })}
              {` · ${t(u.state === 'active' ? 'stateActive' : 'stateInvited')}`}
              {` · ${t(u.recipeCount === 1 ? 'recipeCountOne' : 'recipeCount', { n: u.recipeCount })}`}
              {!u.enabled && ` · ${t('disabled')}`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Settings({ user, me, onSignOut }) {
  const { t } = useLanguage();
  const canInvite = Boolean(me?.canInvite);
  const [users, setUsers] = useState([]);

  // A failed lookup just leaves the admin sections out.
  const loadUsers = () =>
    api
      .listUsers()
      .then((res) => setUsers(res.users))
      .catch(() => {});

  useEffect(() => {
    if (canInvite) loadUsers();
  }, [canInvite]);

  return (
    <div className="settings-page">
      <h2>{t('settings')}</h2>
      <div className="settings-section">
        <p className="settings-label">{t('signedInAs')}</p>
        <p className="settings-user">{me?.displayName ?? user}</p>
        {me?.displayName && me.displayName !== user && <p className="hint">{user}</p>}
      </div>
      <div className="settings-section">
        <p className="settings-label">{t('language')}</p>
        <LanguageSwitch />
      </div>
      {canInvite && users.length > 0 && <People users={users} />}
      {canInvite && <Invite onInvited={loadUsers} />}
      <button className="btn danger" type="button" onClick={onSignOut}>
        {t('signOut')}
      </button>
    </div>
  );
}
