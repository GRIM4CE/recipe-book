import { inkFor } from '../ink.js';

export default function RecipeCard({ recipe }) {
  const color = recipe.category?.color ?? '#8b8378';
  const hint = recipe.ingredients?.[0];
  return (
    <a
      className="card"
      href={`#/recipes/${recipe.id}`}
      style={{ '--card-color': color, '--card-ink': inkFor(color) }}
    >
      <h3 className="card-title">{recipe.title}</h3>
      {/* Only shows when the stack is roomy enough; the card clips it otherwise. */}
      {hint && <p className="card-hint">{hint}</p>}
    </a>
  );
}
