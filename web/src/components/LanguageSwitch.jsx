import { LANGUAGES } from '../i18n.js';
import { useLanguage } from '../useLanguage.jsx';

// The reader's default language unless told otherwise. A recipe passes its own
// `value`/`onChange`, languages it can't offer (`disabledLanguages`), and the
// ones being translated right now (`busyLanguages`, which lock the whole switch).
export default function LanguageSwitch({
  value,
  onChange,
  disabledLanguages = [],
  busyLanguages = [],
}) {
  const { lang, setLang, t } = useLanguage();
  const busy = busyLanguages.length > 0;
  return (
    <div className="lang-switch" role="group" aria-label={t('language')}>
      {LANGUAGES.map((code) => {
        const unavailable = disabledLanguages.includes(code);
        return (
          <button
            key={code}
            type="button"
            className="btn ghost small"
            aria-pressed={(value ?? lang) === code}
            aria-disabled={unavailable || undefined}
            disabled={busy || unavailable}
            title={unavailable ? t('translationPending') : undefined}
            onClick={() => (onChange ?? setLang)(code)}
          >
            {busyLanguages.includes(code) ? t('translating') : code.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
