import { useEffect, useRef, useState } from 'react';
import { filterRecipes } from '../filter.js';
import { useDismiss } from '../useDismiss.js';
import { useLanguage } from '../useLanguage.jsx';
import Icon from './Icon.jsx';
import RecipeCard from './RecipeCard.jsx';

// Past this the slats are all at their floor height and it's just scrolling;
// searching is the faster way to the rest.
const MAX_SHOWN = 50;

// Wide screens get two stacks side by side rather than one lonely column.
const TWO_COLUMNS = '(min-width: 900px)';

function useTwoColumns() {
  const [two, setTwo] = useState(() => window.matchMedia(TWO_COLUMNS).matches);
  useEffect(() => {
    const mq = window.matchMedia(TWO_COLUMNS);
    const onChange = (e) => setTwo(e.matches);
    setTwo(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return two;
}

// Search, filters and scroll position live in App so they survive the trip
// into a recipe and back: the list you return to is the list you left.
export default function RecipeGrid({
  recipes,
  categories,
  filters,
  onFilters,
  scrollRef,
}) {
  const { t } = useLanguage();
  const { query, categoryId, tag, ingredient, createdBy, filtersOpen } = filters;
  const set = (patch) => onFilters({ ...filters, ...patch });
  const stacksRef = useRef(null);
  const twoColumns = useTwoColumns();
  const filtersRef = useDismiss(filtersOpen, () => set({ filtersOpen: false }));
  const tagNames = [...new Set(recipes.flatMap((r) => r.tags ?? []))].sort((a, b) =>
    a.localeCompare(b),
  );
  const people = [...new Set(recipes.map((r) => r.createdBy).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
  const matched = filterRecipes(recipes, { query, categoryId, tag, ingredient, createdBy });
  const visible = matched.slice(0, MAX_SHOWN);
  const columns = twoColumns
    ? [visible.slice(0, Math.ceil(visible.length / 2)), visible.slice(Math.ceil(visible.length / 2))]
    : [visible];

  // Tags, ingredient and person live behind the funnel, so the funnel carries a
  // count and each active one shows as a removable chip in the search field.
  const hiddenCount = (tag ? 1 : 0) + (ingredient.trim() ? 1 : 0) + (createdBy ? 1 : 0);
  const hasFilters =
    Boolean(query.trim()) ||
    categoryId != null ||
    tag != null ||
    Boolean(ingredient.trim()) ||
    createdBy != null;

  // The stack claims whatever height the search and filters leave over; CSS then
  // divides it across the cards, so a longer list packs tighter on its own.
  useEffect(() => {
    const el = stacksRef.current;
    if (!el) return;
    const measure = () =>
      el.style.setProperty('--stack-top', `${el.getBoundingClientRect().top + window.scrollY}px`);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [hiddenCount, visible.length === 0]);

  // Put the reader back where they were. The position is banked on the way out
  // (see the stack's onClickCapture) rather than on unmount, because following
  // a card's link scrolls the page to the top before React hears about it.
  useEffect(() => {
    window.scrollTo(0, scrollRef.current);
  }, [scrollRef]);

  function clearFilters() {
    set({ query: '', categoryId: null, tag: null, ingredient: '', createdBy: null });
  }

  // Draws from everything that matched, not just the slats on screen.
  function findSomethingGood() {
    if (matched.length === 0) return;
    const pick = matched[Math.floor(Math.random() * matched.length)];
    window.location.hash = `#/recipes/${pick.id}`;
  }

  const activeChips = [
    ingredient.trim() && { label: ingredient.trim(), clear: { ingredient: '' } },
    tag && { label: `#${tag}`, clear: { tag: null } },
    createdBy && { label: createdBy, clear: { createdBy: null } },
  ].filter(Boolean);

  return (
    <div className="grid-page">
      <div className="search-wrap" ref={filtersRef}>
        <div className="search-pill">
          <Icon name="search" />
          {activeChips.map((chip) => (
            <span key={chip.label} className="search-chip">
              {chip.label}
              <button
                type="button"
                aria-label={t('removeFilter', { label: chip.label })}
                onClick={() => set(chip.clear)}
              >
                <Icon name="x" size={12} />
              </button>
            </span>
          ))}
          <input
            className="search"
            type="search"
            placeholder={hiddenCount > 0 ? t('searchWithin') : t('searchPlaceholder')}
            aria-label={t('searchPlaceholder')}
            value={query}
            onChange={(e) => set({ query: e.target.value })}
            onFocus={() => filtersOpen && set({ filtersOpen: false })}
          />
          <button
            type="button"
            className={hiddenCount > 0 ? 'funnel active' : 'funnel'}
            aria-label={t('filters')}
            aria-haspopup="dialog"
            aria-expanded={filtersOpen}
            onClick={() => set({ filtersOpen: !filtersOpen })}
          >
            <Icon name="funnel" size={16} />
            {hiddenCount > 0 && <span className="funnel-count">{hiddenCount}</span>}
          </button>
        </div>

        {filtersOpen && (
          <div className="filter-popover" role="dialog" aria-label={t('filters')}>
            <label className="field">
              {t('ingredient')}
              <input
                type="text"
                value={ingredient}
                onChange={(e) => set({ ingredient: e.target.value })}
                placeholder={t('ingredientPlaceholder')}
              />
            </label>
            {tagNames.length > 0 && (
              <div className="filter-group">
                <span className="eyebrow">{t('tags')}</span>
                <div className="chip-wrap">
                  {tagNames.map((name) => (
                    <button
                      key={name}
                      type="button"
                      className={tag === name ? 'chip small active' : 'chip small'}
                      style={{ '--chip-color': '#a89e90' }}
                      aria-pressed={tag === name}
                      onClick={() => set({ tag: tag === name ? null : name })}
                    >
                      #{name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {people.length >= 2 && (
              <div className="filter-group">
                <span className="eyebrow">{t('byPerson')}</span>
                <div className="chip-wrap">
                  {people.map((name) => (
                    <button
                      key={name}
                      type="button"
                      className={createdBy === name ? 'chip small active' : 'chip small'}
                      style={{ '--chip-color': '#a89e90' }}
                      aria-pressed={createdBy === name}
                      onClick={() => set({ createdBy: createdBy === name ? null : name })}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="filter-actions">
              <button
                type="button"
                className="btn primary"
                onClick={findSomethingGood}
                disabled={matched.length === 0}
              >
                {t('findGood')}
              </button>
              <button type="button" className="btn quiet" onClick={() => set({ filtersOpen: false })}>
                {t('done')}
              </button>
              {hasFilters && (
                <button type="button" className="btn quiet small clear-all" onClick={clearFilters}>
                  {t('clearAll')}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="chips" role="group" aria-label={t('category')}>
        <button
          type="button"
          className={categoryId === null ? 'chip active' : 'chip'}
          style={{ '--chip-color': '#8b8378' }}
          aria-pressed={categoryId === null}
          onClick={() => set({ categoryId: null })}
        >
          {t('all')}
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            className={categoryId === c.id ? 'chip active' : 'chip'}
            style={{ '--chip-color': c.color }}
            aria-pressed={categoryId === c.id}
            onClick={() => set({ categoryId: categoryId === c.id ? null : c.id })}
          >
            {c.name}
          </button>
        ))}
      </div>
      <p className="match-count">{t('matchCount', { shown: matched.length, total: recipes.length })}</p>

      {visible.length === 0 ? (
        <div className="empty">
          <p className="empty-title">{t('noMatch')}</p>
          <p>{t('noMatchHint')}</p>
          {hasFilters && (
            <button type="button" className="btn outline" onClick={clearFilters}>
              {t('clearFilters')}
            </button>
          )}
        </div>
      ) : (
        <>
          <div
            className="stacks"
            ref={stacksRef}
            onClickCapture={() => {
              scrollRef.current = window.scrollY;
            }}
          >
            {columns.map((column, i) => (
              // The count drives how thin a slat gets: the screen is split this
              // many ways.
              <div className="stack" key={i} style={{ '--stack-count': column.length }}>
                {column.map((r) => (
                  <RecipeCard key={r.id} recipe={r} />
                ))}
              </div>
            ))}
          </div>
          {matched.length > visible.length && (
            <p className="notice stack-more">
              {t('showing', { shown: visible.length, total: matched.length })}
            </p>
          )}
        </>
      )}
    </div>
  );
}
