import { inkFor } from '../ink.js';
import RecipeLanguageSwitch from './RecipeLanguageSwitch.jsx';

export default function RecipeCard({ recipe, canEdit, busy, onViewLanguage }) {
  const color = recipe.category?.color ?? '#8b8378';
  const steps = recipe.instructions?.join(' ');
  // Every slat carries the whole recipe — ingredients and instructions both —
  // and grows to fit it. Hidden from screen readers, which get the title as the
  // link's name and the same recipe on the page it opens. The language switch
  // sits beside the link, not inside it: a button can't live in an anchor.
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
      <RecipeLanguageSwitch
        recipe={recipe}
        canEdit={canEdit}
        busy={busy}
        onSelect={onViewLanguage}
      />
    </div>
  );
}
