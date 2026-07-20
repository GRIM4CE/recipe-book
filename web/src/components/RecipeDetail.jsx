import { useState } from 'react';
import { scaleIngredient, scaleServings } from '../scale.js';

const SCALES = [
  { label: '⅛×', factor: 1 / 8 },
  { label: '¼×', factor: 1 / 4 },
  { label: '½×', factor: 1 / 2 },
  { label: '1×', factor: 1 },
  { label: '2×', factor: 2 },
  { label: '4×', factor: 4 },
  { label: '8×', factor: 8 },
];

export default function RecipeDetail({ recipe, canEdit, onDelete }) {
  const [factor, setFactor] = useState(1);
  const color = recipe.category?.color ?? '#8b8378';
  const added = new Date(recipe.createdAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <article className="detail">
      <header className="detail-hero" style={{ '--card-color': color }}>
        <a className="back" href="#/">‹ All recipes</a>
        <h2>{recipe.title}</h2>
        {recipe.category && (
          <span className="card-category">{recipe.category.name}</span>
        )}
        {recipe.tags?.length > 0 && (
          <div className="detail-tags">
            {recipe.tags.map((t) => (
              <span key={t} className="tag">
                #{t}
              </span>
            ))}
          </div>
        )}
        {recipe.summary && <p className="detail-summary">{recipe.summary}</p>}
        {recipe.photoUrl && (
          <img className="detail-photo" src={recipe.photoUrl} alt={recipe.title} />
        )}
      </header>

      {recipe.ingredients.length > 0 && (
        <section className="detail-section">
          <div className="ingredients-header">
            <h3>Ingredients</h3>
            <div className="scale-picker" role="group" aria-label="Scale recipe">
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
              Servings: {scaleServings(recipe.servings, factor)}
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
          <h3>Instructions</h3>
          <ol className="instructions">
            {recipe.instructions.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </section>
      )}

      {recipe.notes && (
        <section className="detail-section">
          <h3>Notes</h3>
          <p className="notes">{recipe.notes}</p>
        </section>
      )}

      {canEdit && (
        <div className="detail-actions">
          <a className="btn ghost" href={`#/recipes/${recipe.id}/edit`}>Edit</a>
          <button className="btn danger" type="button" onClick={() => onDelete(recipe)}>
            Delete
          </button>
        </div>
      )}

      <p className="detail-meta">
        Added by {recipe.createdBy} · {added}
      </p>
    </article>
  );
}
