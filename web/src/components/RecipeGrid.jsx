import { useState } from 'react';
import { filterRecipes } from '../filter.js';
import RecipeCard from './RecipeCard.jsx';

export default function RecipeGrid({ recipes, categories }) {
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState(null);
  const [tag, setTag] = useState(null);
  const [ingredient, setIngredient] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const tagNames = [...new Set(recipes.flatMap((r) => r.tags ?? []))].sort((a, b) =>
    a.localeCompare(b),
  );
  const visible = filterRecipes(recipes, { query, categoryId, tag, ingredient });

  // Tags + ingredient live inside the collapsed panel, so surface a count on
  // the toggle to hint at active filters you can't currently see.
  const hiddenCount = (tag ? 1 : 0) + (ingredient.trim() ? 1 : 0);
  const hasFilters =
    Boolean(query.trim()) || categoryId != null || tag != null || Boolean(ingredient.trim());

  function clearFilters() {
    setQuery('');
    setCategoryId(null);
    setTag(null);
    setIngredient('');
  }

  function findSomethingGood() {
    if (visible.length === 0) return;
    const pick = visible[Math.floor(Math.random() * visible.length)];
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
            disabled={visible.length === 0}
          >
            Find me something good
          </button>
        </div>
      )}

      {visible.length === 0 ? (
        <p className="notice">No recipes match. Time to invent one?</p>
      ) : (
        <div className="grid">
          {visible.map((r) => (
            <RecipeCard key={r.id} recipe={r} />
          ))}
        </div>
      )}
    </div>
  );
}
