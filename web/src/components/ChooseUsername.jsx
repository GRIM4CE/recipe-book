import { useState } from 'react';
import { useLanguage } from '../useLanguage.jsx';

// Shown in place of every page until a signed-in person has picked the name
// their recipes are signed with. onSave rejects with the API's message.
export default function ChooseUsername({ onSave }) {
  const { t } = useLanguage();
  const [username, setUsername] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSave(username.trim());
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form className="form login-form" onSubmit={submit}>
      <h2>{t('chooseTitle')}</h2>
      <p className="hint">{t('chooseHint')}</p>
      <input
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        aria-label={t('chooseTitle')}
        autoCapitalize="off"
        autoComplete="off"
        maxLength={32}
        required
      />
      {error && <p className="error">{error}</p>}
      <button className="btn primary" type="submit" disabled={busy}>
        {busy ? t('saving') : t('save')}
      </button>
    </form>
  );
}
