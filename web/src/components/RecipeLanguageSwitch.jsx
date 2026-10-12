import { LANGUAGES } from '../i18n.js';
import LanguageSwitch from './LanguageSwitch.jsx';

// Which language this one recipe is shown in. A language the recipe hasn't been
// translated into yet is one tap away for someone signed in (App translates it
// on the spot) and greyed out for everyone else.
export default function RecipeLanguageSwitch({ recipe, canEdit, busy, onSelect }) {
  const missing = LANGUAGES.filter(
    (code) => code !== recipe.language && !recipe.translations?.[code],
  );
  return (
    <LanguageSwitch
      value={recipe.viewLanguage}
      onChange={(code) => onSelect(recipe.original, code)}
      disabledLanguages={canEdit ? [] : missing}
      busyLanguages={busy ? missing : []}
    />
  );
}
