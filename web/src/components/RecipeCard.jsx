// Category colors run from butter yellow to aubergine and the title sits
// straight on them, so pick the ink by luminance instead of always going light.
export function inkFor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!m) return '#fff8ef';
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.62 ? '#2a2622' : '#fff8ef';
}

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
