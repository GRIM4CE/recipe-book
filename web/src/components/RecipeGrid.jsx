import { useState } from 'react';
import { filterRecipes } from '../filter.js';
import RecipeCard from './RecipeCard.jsx';

export default function RecipeGrid({ recipes, categories }) {
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState(null);
  const [tag, setTag] = useState(null);
  const tagNames = [...new Set(recipes.flatMap((r) => r.tags ?? []))].sort((a, b) =>
    a.localeCompare(b),
  );
  const visible = filterRecipes(recipes, { query, categoryId, tag });

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
      {tagNames.length > 0 && (
        <div className="chips tag-chips" role="tablist">
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
