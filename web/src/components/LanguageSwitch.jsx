import { LANGUAGES } from '../i18n.js';
import { useLanguage } from '../useLanguage.jsx';

export default function LanguageSwitch() {
  const { lang, setLang, t } = useLanguage();
  return (
    <div className="lang-switch" role="group" aria-label={t('language')}>
      {LANGUAGES.map((code) => (
        <button
          key={code}
          type="button"
          className="btn ghost small"
          aria-pressed={lang === code}
          onClick={() => setLang(code)}
        >
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
