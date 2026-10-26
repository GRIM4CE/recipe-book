import { inkFor } from '../ink.js';

export default function RecipeCard({ recipe }) {
  const color = recipe.category?.color ?? '#8b8378';
  const steps = recipe.instructions?.join(' ');
  // Every slat carries the whole recipe — ingredients and instructions both —
  // and grows to fit it. Hidden from screen readers, which get the title as the
  // link's name and the same recipe on the page it opens. The recipe's language
  // is picked on its own page, not on the slat.
  return (
    <div className="card-wrap" style={{ '--card-color': color, '--card-ink': inkFor(color) }}>
      <a className="card" href={`#/recipes/${recipe.id}`}>
        <h3 className="card-title">{recipe.title}</h3>
        <div className="card-preview" aria-hidden="true">
          {recipe.ingredients?.length > 0 && (
            <ul className="card-ingredients">
              {recipe.ingredients.map((ing, i) => (
                <li key={i}>{ing}</li>
              ))}
            </ul>
          )}
          {steps && <p className="card-steps">{steps}</p>}
        </div>
      </a>
    </div>
  );
}
