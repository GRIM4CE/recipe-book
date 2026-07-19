export default function RecipeCard({ recipe }) {
  const color = recipe.category?.color ?? '#8b8378';
  return (
    <a
      className="card"
      href={`#/recipes/${recipe.id}`}
      style={{ '--card-color': color }}
    >
      <div className="card-art">
        {recipe.photoUrl ? (
          <img src={recipe.photoUrl} alt="" loading="lazy" />
        ) : (
          <span className="card-monogram" aria-hidden="true">
            {recipe.title.trim().charAt(0).toUpperCase()}
          </span>
        )}
      </div>
      <div className="card-body">
        <h3 className="card-title">{recipe.title}</h3>
        {recipe.category && (
          <span className="card-category">{recipe.category.name}</span>
        )}
      </div>
    </a>
  );
}
