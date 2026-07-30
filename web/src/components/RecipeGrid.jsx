import { useEffect, useRef, useState } from 'react';
import { filterRecipes } from '../filter.js';
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

export default function RecipeGrid({ recipes, categories }) {
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState(null);
  const [tag, setTag] = useState(null);
  const [ingredient, setIngredient] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const stacksRef = useRef(null);
  const twoColumns = useTwoColumns();
  const tagNames = [...new Set(recipes.flatMap((r) => r.tags ?? []))].sort((a, b) =>
    a.localeCompare(b),
  );
  const matched = filterRecipes(recipes, { query, categoryId, tag, ingredient });
  const visible = matched.slice(0, MAX_SHOWN);
  const columns = twoColumns
    ? [visible.slice(0, Math.ceil(visible.length / 2)), visible.slice(Math.ceil(visible.length / 2))]
    : [visible];

  // Tags + ingredient live inside the collapsed panel, so surface a count on
  // the toggle to hint at active filters you can't currently see.
  const hiddenCount = (tag ? 1 : 0) + (ingredient.trim() ? 1 : 0);
  const hasFilters =
    Boolean(query.trim()) || categoryId != null || tag != null || Boolean(ingredient.trim());

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
  }, [filtersOpen, visible.length === 0]);

  function clearFilters() {
    setQuery('');
    setCategoryId(null);
    setTag(null);
    setIngredient('');
  }

  // Draws from everything that matched, not just the slats on screen.
  function findSomethingGood() {
    if (matched.length === 0) return;
    const pick = matched[Math.floor(Math.random() * matched.length)];
    window.location.hash = `#/recipes/${pick.id}`;
  }

  return (
    <div className="grid-page">
      <input
        className="search"
        type="search"
        placeholder="Search recipes, ingredients…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="chips" role="tablist">
        <button
          type="button"
          className={categoryId === null ? 'chip active' : 'chip'}
          style={{ '--chip-color': '#8b8378' }}
          onClick={() => setCategoryId(null)}
        >
          All
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            className={categoryId === c.id ? 'chip active' : 'chip'}
            style={{ '--chip-color': c.color }}
            onClick={() => setCategoryId(categoryId === c.id ? null : c.id)}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="filter-bar">
        <button
          type="button"
          className="btn ghost small"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((open) => !open)}
        >
          Filters{hiddenCount > 0 ? ` (${hiddenCount})` : ''} {filtersOpen ? '▲' : '▼'}
        </button>
        {hasFilters && (
          <button type="button" className="btn ghost small" onClick={clearFilters}>
            Clear
          </button>
        )}
      </div>

      {filtersOpen && (
        <div className="filter-panel">
          <label className="filter-ingredient">
            Ingredient
            <input
              type="text"
              value={ingredient}
              onChange={(e) => setIngredient(e.target.value)}
              placeholder="e.g. campari"
            />
          </label>
          {tagNames.length > 0 && (
            <div className="chips" role="tablist">
              {tagNames.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={tag === t ? 'chip active' : 'chip'}
                  style={{ '--chip-color': '#8b8378' }}
                  onClick={() => setTag(tag === t ? null : t)}
                >
                  #{t}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            className="btn primary find-good"
            onClick={findSomethingGood}
            disabled={matched.length === 0}
          >
            Find me something good
          </button>
        </div>
      )}

      {visible.length === 0 ? (
        <p className="notice">No recipes match. Time to invent one?</p>
      ) : (
        <>
          <div className="stacks" ref={stacksRef}>
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
              Showing {visible.length} of {matched.length}. Search or filter to find the rest.
            </p>
          )}
        </>
      )}
    </div>
  );
}
