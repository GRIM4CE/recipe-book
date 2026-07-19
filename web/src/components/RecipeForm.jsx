import { useState } from 'react';
import { api } from '../api.js';

const lines = (text) =>
  text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

// One line per ingredient/step: far friendlier on a phone than dynamic rows.
export default function RecipeForm({ recipe, categories, onSaved }) {
  const [title, setTitle] = useState(recipe?.title ?? '');
  const [summary, setSummary] = useState(recipe?.summary ?? '');
  const [categoryId, setCategoryId] = useState(recipe?.category?.id ?? '');
  const [ingredients, setIngredients] = useState(
    recipe?.ingredients.join('\n') ?? '',
  );
  const [instructions, setInstructions] = useState(
    recipe?.instructions.join('\n') ?? '',
  );
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const data = {
      title,
      summary,
      categoryId: categoryId === '' ? null : Number(categoryId),
      ingredients: lines(ingredients),
      instructions: lines(instructions),
      photoKey: recipe?.photoKey ?? null,
    };
    try {
      const saved = recipe
        ? await api.updateRecipe(recipe.id, data)
        : await api.createRecipe(data);
      onSaved(saved);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <h2>{recipe ? 'Edit recipe' : 'New recipe'}</h2>
      <label>
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} required />
      </label>
      <label>
        Summary
        <input
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="One line about this recipe"
        />
      </label>
      <label>
        Category
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">None</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Ingredients <span className="hint-inline">one per line</span>
        <textarea
          rows={8}
          value={ingredients}
          onChange={(e) => setIngredients(e.target.value)}
          placeholder={'2 cups flour\n2 eggs'}
        />
      </label>
      <label>
        Instructions <span className="hint-inline">one step per line</span>
        <textarea
          rows={8}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder={'Mix everything.\nBake at 375°F.'}
        />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="form-actions">
        <a className="btn ghost" href={recipe ? `#/recipes/${recipe.id}` : '#/'}>
          Cancel
        </a>
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save recipe'}
        </button>
      </div>
    </form>
  );
}
