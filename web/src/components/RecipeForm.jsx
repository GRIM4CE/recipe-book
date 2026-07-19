import { useState } from 'react';
import { api } from '../api.js';
import { blobToBase64, downscaleToJpeg } from '../image.js';

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
  // photo: unchanged (undefined) | removed (null) | new blob
  const [photoBlob, setPhotoBlob] = useState(undefined);
  const [photoPreview, setPhotoPreview] = useState(recipe?.photoUrl ?? null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Import panel: only offered when creating, collapses after a successful
  // extraction.
  const [showImport, setShowImport] = useState(!recipe);
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);

  async function pickPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const blob = await downscaleToJpeg(file);
      setPhotoBlob(blob);
      setPhotoPreview(URL.createObjectURL(blob));
    } catch (err) {
      setError(err.message);
    }
  }

  function removePhoto() {
    setPhotoBlob(null);
    setPhotoPreview(null);
  }

  async function runImport(payload) {
    setImporting(true);
    setError(null);
    try {
      const extracted = await api.extractRecipe(payload);
      setTitle(extracted.title);
      setSummary(extracted.summary);
      setCategoryId(extracted.categoryId ?? '');
      setIngredients(extracted.ingredients.join('\n'));
      setInstructions(extracted.instructions.join('\n'));
      setImportText('');
      setShowImport(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  }

  async function importFromPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setImporting(true);
    setError(null);
    try {
      const blob = await downscaleToJpeg(file);
      const image = await blobToBase64(blob);
      await runImport({ image, mediaType: 'image/jpeg' });
    } catch (err) {
      setError(err.message);
      setImporting(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      let photoKey = recipe?.photoKey ?? null;
      if (photoBlob === null) photoKey = null;
      else if (photoBlob) photoKey = await api.uploadPhoto(photoBlob);
      const data = {
        title,
        summary,
        categoryId: categoryId === '' ? null : Number(categoryId),
        ingredients: lines(ingredients),
        instructions: lines(instructions),
        photoKey,
      };
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
      {!recipe &&
        (showImport ? (
          <div className="import-panel">
            <span className="field-title">Import from text or photo</span>
            <textarea
              rows={4}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="Paste a recipe from anywhere…"
              disabled={importing}
            />
            <div className="form-actions import-actions">
              <button
                className="btn ghost small"
                type="button"
                onClick={() => runImport({ text: importText })}
                disabled={importing || !importText.trim()}
              >
                {importing ? 'Reading recipe…' : 'Extract from text'}
              </button>
              <label className="btn ghost small">
                {importing ? 'Reading recipe…' : 'Extract from photo'}
                <input
                  type="file"
                  accept="image/*"
                  onChange={importFromPhoto}
                  hidden
                  disabled={importing}
                />
              </label>
            </div>
          </div>
        ) : (
          <button
            className="btn ghost small"
            type="button"
            onClick={() => setShowImport(true)}
          >
            Import from text or photo
          </button>
        ))}
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
      <div className="photo-field">
        <span className="field-title">Photo</span>
        {photoPreview && <img className="photo-preview" src={photoPreview} alt="" />}
        <div className="form-actions photo-actions">
          <label className="btn ghost small">
            {photoPreview ? 'Replace photo' : 'Add photo'}
            <input type="file" accept="image/*" onChange={pickPhoto} hidden />
          </label>
          {photoPreview && (
            <button className="btn danger small" type="button" onClick={removePhoto}>
              Remove
            </button>
          )}
        </div>
      </div>
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
        <button className="btn primary" type="submit" disabled={busy || importing}>
          {busy ? 'Saving…' : 'Save recipe'}
        </button>
      </div>
    </form>
  );
}
