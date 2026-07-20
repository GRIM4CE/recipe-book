import { useEffect, useState } from 'react';
import { scaleIngredient, scaleServings } from '../scale.js';
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

export default function RecipeDetail({ recipe, recipes = [], canEdit }) {
  const [factor, setFactor] = useState(1);
  const [shareNote, setShareNote] = useState('');
  const color = recipe.category?.color ?? '#8b8378';
  const added = new Date(recipe.createdAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Give each recipe its own tab/history title for bookmarks and shares.
  useEffect(() => {
    const previous = document.title;
    document.title = `${recipe.title} · Recipe Book`;
    return () => {
      document.title = previous;
    };
  }, [recipe.title]);

  async function share() {
    const url = window.location.href;
    const data = { title: recipe.title, text: recipe.summary || recipe.title, url };
    try {
      if (navigator.share) {
        await navigator.share(data);
        return;
      }
      await navigator.clipboard.writeText(url);
      setShareNote('Link copied');
    } catch (err) {
      if (err?.name === 'AbortError') return; // user dismissed the share sheet
      setShareNote('Couldn’t share');
    }
    setTimeout(() => setShareNote(''), 2000);
  }

  return (
    <article className="detail">
      <div className="detail-topbar">
        <a className="back" href="#/">‹ All recipes</a>
        <div className="detail-top-actions">
          {shareNote && <span className="share-note">{shareNote}</span>}
          <button className="btn ghost small" type="button" onClick={share}>
            Share
          </button>
          {canEdit && (
            <a className="btn ghost small" href={`#/recipes/${recipe.id}/edit`}>
              Edit
            </a>
          )}
        </div>
      </div>
      <header className="detail-hero" style={{ '--card-color': color }}>
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
              <li key={i}>
                <RichText text={step} recipes={recipes} excludeId={recipe.id} />
              </li>
            ))}
          </ol>
        </section>
      )}

      {recipe.notes && (
        <section className="detail-section">
          <h3>Notes</h3>
          <p className="notes">
            <RichText text={recipe.notes} recipes={recipes} excludeId={recipe.id} />
          </p>
        </section>
      )}

      <p className="detail-meta">
        Added by {recipe.createdBy} · {added}
      </p>
    </article>
  );
}
