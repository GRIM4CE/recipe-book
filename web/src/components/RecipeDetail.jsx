import { useEffect, useState } from 'react';
import { inkFor } from '../ink.js';
import { scaleIngredient, scaleServings } from '../scale.js';
import { useLanguage } from '../useLanguage.jsx';
import RecipeLanguageSwitch from './RecipeLanguageSwitch.jsx';
import RichText from './RichText.jsx';

const SCALES = [
  { label: '⅛×', factor: 1 / 8 },
  { label: '¼×', factor: 1 / 4 },
  { label: '½×', factor: 1 / 2 },
  { label: '1×', factor: 1 },
  { label: '2×', factor: 2 },
  { label: '4×', factor: 4 },
  { label: '8×', factor: 8 },
];

export default function RecipeDetail({
  recipe,
  recipes = [],
  canEdit,
  busy,
  onDuplicate,
  onTranslate,
  onViewLanguage,
}) {
  const { lang, t } = useLanguage();
  const [factor, setFactor] = useState(1);
  const [shareNote, setShareNote] = useState('');
  const [copying, setCopying] = useState(false);
  const [translating, setTranslating] = useState(false);
  const color = recipe.category?.color ?? '#8b8378';
  const { shown, stale } = recipe.translation;
  const translationNote = [
    shown === 'translated' &&
      t('translatedFrom', { language: t(`languageFrom_${recipe.language}`) }),
    stale && t('translationStale'),
  ]
    .filter(Boolean)
    .join(' · ');
  const added = new Date(recipe.createdAt).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Give each recipe its own tab/history title for bookmarks and shares.
  useEffect(() => {
    const previous = document.title;
    document.title = `${recipe.title} · ${t('appName')}`;
    return () => {
      document.title = previous;
    };
  }, [recipe.title, t]);

  async function share() {
    const url = window.location.href;
    const data = { title: recipe.title, text: recipe.summary || recipe.title, url };
    try {
      if (navigator.share) {
        await navigator.share(data);
        return;
      }
      await navigator.clipboard.writeText(url);
      setShareNote(t('linkCopied'));
    } catch (err) {
      if (err?.name === 'AbortError') return; // user dismissed the share sheet
      setShareNote(t('shareFailed'));
    }
    setTimeout(() => setShareNote(''), 2000);
  }

  // The whole page is the recipe's card: same color and ink as its slat in the
  // stack, opened up to hold the recipe itself.
  return (
    <article className="detail" style={{ '--card-color': color, '--card-ink': inkFor(color) }}>
      <div className="detail-topbar">
        <a className="btn ghost small back" href="#/">‹ {t('back')}</a>
        <div className="detail-top-actions">
          {shareNote && <span className="share-note">{shareNote}</span>}
          <RecipeLanguageSwitch
            recipe={recipe}
            canEdit={canEdit}
            busy={busy}
            onSelect={onViewLanguage}
          />
          <button className="btn ghost small" type="button" onClick={share}>
            {t('share')}
          </button>
          {canEdit && (
            <button
              className="btn ghost small"
              type="button"
              disabled={copying}
              onClick={async () => {
                setCopying(true);
                await onDuplicate(recipe);
                setCopying(false);
              }}
            >
              {copying ? t('duplicating') : t('duplicate')}
            </button>
          )}
          {canEdit && (
            <a className="btn ghost small" href={`#/recipes/${recipe.id}/edit`}>
              {t('edit')}
            </a>
          )}
        </div>
      </div>

      <header className="detail-head">
        <h2 className="detail-title">{recipe.title}</h2>
        {recipe.category && (
          <span className="card-category">{recipe.category.name}</span>
        )}
        {recipe.tags?.length > 0 && (
          <div className="detail-tags">
            {recipe.tags.map((tag) => (
              <span key={tag} className="tag">
                #{tag}
              </span>
            ))}
          </div>
        )}
        {recipe.summary && <p className="detail-summary">{recipe.summary}</p>}
        {translationNote && (
          <p className="detail-translation">
            {translationNote}
            {canEdit && stale && (
              <>
                {' '}
                <button
                  className="btn ghost small"
                  type="button"
                  disabled={translating}
                  onClick={async () => {
                    setTranslating(true);
                    await onTranslate(recipe.original);
                    setTranslating(false);
                  }}
                >
                  {translating ? t('translating') : t('translate')}
                </button>
              </>
            )}
          </p>
        )}
      </header>

      {recipe.ingredients.length > 0 && (
        <section className="detail-section">
          <div className="ingredients-header">
            <h3>{t('ingredients')}</h3>
            <div className="scale-picker" role="group" aria-label={t('scaleRecipe')}>
              {SCALES.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  className={`scale-btn${factor === s.factor ? ' active' : ''}`}
                  onClick={() => setFactor(s.factor)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          {recipe.servings && (
            <p className="servings">
              {t('servingsLabel')} {scaleServings(recipe.servings, factor)}
            </p>
          )}
          <ul className="ingredients">
            {recipe.ingredients.map((ing, i) => (
              <li key={i}>{scaleIngredient(ing, factor)}</li>
            ))}
          </ul>
        </section>
      )}

      {recipe.instructions.length > 0 && (
        <section className="detail-section">
          <h3>{t('instructions')}</h3>
          <ol className="instructions">
            {recipe.instructions.map((step, i) => (
              <li key={i}>
                <RichText text={step} recipes={recipes} excludeId={recipe.id} />
              </li>
            ))}
          </ol>
        </section>
      )}

      {recipe.notes && (
        <section className="detail-section">
          <h3>{t('notes')}</h3>
          <p className="notes">
            <RichText text={recipe.notes} recipes={recipes} excludeId={recipe.id} />
          </p>
        </section>
      )}

      {recipe.photoUrl && (
        <img className="detail-photo" src={recipe.photoUrl} alt={recipe.title} />
      )}

      <p className="detail-meta">
        {t('addedBy', { name: recipe.createdBy, date: added })}
      </p>
    </article>
  );
}
