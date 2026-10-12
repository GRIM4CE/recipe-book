import { useEffect, useState } from 'react';
import { inkFor } from '../ink.js';
import { scaleIngredient, scaleServings } from '../scale.js';
import { useDismiss } from '../useDismiss.js';
import { useLanguage } from '../useLanguage.jsx';
import Icon from './Icon.jsx';
import RecipeLanguageSwitch from './RecipeLanguageSwitch.jsx';
import RichText from './RichText.jsx';

const SCALES = [
  { label: '½×', factor: 1 / 2 },
  { label: '1×', factor: 1 },
  { label: '2×', factor: 2 },
];

const formatFactor = (n) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

// Servings is free text: a bare count reads "Serves 6", anything else
// ("Makes 24 cookies") is shown as written, scaled.
function servesLabel(t, servings, factor) {
  const scaled = scaleServings(servings, factor);
  return /^\d/.test(scaled) ? t('serves', { n: scaled }) : scaled;
}

// Any multiplier the presets don't cover: a stepper in halves, or type one in.
function MultiplierPicker({ factor, onChange, servings }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(null);
  const ref = useDismiss(open, () => setOpen(false));
  const preset = SCALES.some((s) => s.factor === factor);
  const set = (n) => onChange(Math.max(0.25, Math.round(n * 100) / 100));
  const commit = () => {
    const n = parseFloat(String(draft).replace(',', '.'));
    if (n > 0) set(n);
    setDraft(null);
  };

  return (
    <div className="popover-anchor" ref={ref}>
      <button
        type="button"
        className={preset ? 'scale-btn custom' : 'scale-btn custom active'}
        aria-label={t('customMultiplier')}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {preset ? '#' : `${formatFactor(factor)}×`}
        <Icon name="chevron-down" size={14} />
      </button>
      {open && (
        <div className="card-popover multiplier" role="dialog" aria-label={t('customMultiplier')}>
          <label className="eyebrow" htmlFor="multiplier">
            {t('multiplier')}
          </label>
          <div className="stepper">
            <button
              type="button"
              aria-label={t('decreaseMultiplier')}
              onClick={() => set(factor - 0.5)}
            >
              −
            </button>
            <span className="stepper-value">
              <input
                id="multiplier"
                inputMode="decimal"
                value={draft ?? formatFactor(factor)}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => e.key === 'Enter' && commit()}
              />
              <span aria-hidden="true">×</span>
            </span>
            <button
              type="button"
              aria-label={t('increaseMultiplier')}
              onClick={() => set(factor + 0.5)}
            >
              +
            </button>
          </div>
          {servings && (
            <p className="mono-note">{servesLabel(t, servings, factor)}</p>
          )}
          <button type="button" className="btn primary block" onClick={() => setOpen(false)}>
            {t('apply')}
          </button>
        </div>
      )}
    </div>
  );
}

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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useDismiss(menuOpen, () => setMenuOpen(false));
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
        <a className="btn outline back" href="#/">
          <Icon name="chevron-left" size={14} />
          {t('back')}
        </a>
        <div className="detail-top-actions">
          {shareNote && <span className="share-note">{shareNote}</span>}
          <div className="popover-anchor" ref={menuRef}>
            <button
              type="button"
              className="icon-btn"
              aria-label={t('moreActions')}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <Icon name="ellipsis" size={22} />
            </button>
            {menuOpen && (
              <div className="card-popover menu" role="menu" aria-label={t('moreActions')}>
                <div className="menu-language">
                  <span className="eyebrow">{t('language')}</span>
                  <RecipeLanguageSwitch
                    recipe={recipe}
                    canEdit={canEdit}
                    busy={busy}
                    onSelect={onViewLanguage}
                  />
                </div>
                <button
                  className="menu-item"
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    share();
                  }}
                >
                  <Icon name="share" />
                  {t('share')}
                </button>
                {canEdit && (
                  <button
                    className="menu-item"
                    role="menuitem"
                    type="button"
                    disabled={copying}
                    onClick={async () => {
                      setCopying(true);
                      await onDuplicate(recipe);
                      setCopying(false);
                    }}
                  >
                    <Icon name="copy" />
                    {copying ? t('duplicating') : t('duplicate')}
                  </button>
                )}
                {canEdit && (
                  <a className="menu-item" role="menuitem" href={`#/recipes/${recipe.id}/edit`}>
                    <Icon name="pencil" />
                    {t('edit')}
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <header className="detail-head">
        <h2 className="detail-title">{recipe.title}</h2>
        {recipe.category && <span className="eyebrow">{recipe.category.name}</span>}
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
            {recipe.servings && (
              <p className="mono-note" aria-live="polite">
                {servesLabel(t, recipe.servings, factor)}
              </p>
            )}
          </div>
          <div className="scale-picker" role="radiogroup" aria-label={t('scaleRecipe')}>
            {SCALES.map((s) => (
              <button
                key={s.label}
                type="button"
                role="radio"
                aria-checked={factor === s.factor}
                className={`scale-btn${factor === s.factor ? ' active' : ''}`}
                onClick={() => setFactor(s.factor)}
              >
                {s.label}
              </button>
            ))}
            <MultiplierPicker factor={factor} onChange={setFactor} servings={recipe.servings} />
          </div>
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
