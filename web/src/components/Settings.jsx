import { useLanguage } from '../useLanguage.jsx';

export default function Settings({ user, onSignOut }) {
  const { t } = useLanguage();
  return (
    <div className="settings-page">
      <h2>{t('settings')}</h2>
      <div className="settings-section">
        <p className="settings-label">{t('signedInAs')}</p>
        <p className="settings-user">{user}</p>
      </div>
      <button className="btn danger" type="button" onClick={onSignOut}>
        {t('signOut')}
      </button>
    </div>
  );
}
