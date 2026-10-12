import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { STRINGS, detectLanguage, loadLanguage, saveLanguage, translate } from './i18n.js';

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => detectLanguage(navigator.language, loadLanguage()));

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo(
    () => ({
      lang,
      setLang: (next) => {
        saveLanguage(next);
        setLangState(next);
      },
      t: (key, vars) => translate(STRINGS, lang, key, vars),
    }),
    [lang],
  );
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}
