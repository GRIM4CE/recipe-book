export default function RecipeDetail({ recipe }) {
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
        {recipe.summary && <p className="detail-summary">{recipe.summary}</p>}
        {recipe.photoUrl && (
          <img className="detail-photo" src={recipe.photoUrl} alt={recipe.title} />
        )}
      </header>

      {recipe.ingredients.length > 0 && (
        <section className="detail-section">
          <h3>Ingredients</h3>
          <ul className="ingredients">
            {recipe.ingredients.map((ing, i) => (
              <li key={i}>{ing}</li>
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

      <p className="detail-meta">
        Added by {recipe.createdBy} · {added}
      </p>
    </article>
  );
}
