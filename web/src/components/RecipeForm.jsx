import { useState } from 'react';
import { api } from '../api.js';
import { blobToBase64, downscaleToJpeg } from '../image.js';
const lines = (text) =>
  text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

// One line per ingredient/step: far friendlier on a phone than dynamic rows.
export default function RecipeForm({ recipe, categories, tagSuggestions = [], onSaved }) {
  const [title, setTitle] = useState(recipe?.title ?? '');
  const [summary, setSummary] = useState(recipe?.summary ?? '');
  const [servings, setServings] = useState(recipe?.servings ?? '');
  const [categoryId, setCategoryId] = useState(recipe?.category?.id ?? '');
  const [tags, setTags] = useState(recipe?.tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const [ingredients, setIngredients] = useState(
    recipe?.ingredients.join('\n') ?? '',
  );
  const [instructions, setInstructions] = useState(
    recipe?.instructions.join('\n') ?? '',
  );
  const [notes, setNotes] = useState(recipe?.notes ?? '');
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
  const [importUrl, setImportUrl] = useState('');
  // Non-null after an extraction that found several recipes: the picker list.
  const [foundRecipes, setFoundRecipes] = useState(null);

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

  function applyRecipe(r) {
    setTitle(r.title);
    setSummary(r.summary);
    setServings(r.servings ?? '');
    setCategoryId(r.categoryId ?? '');
    setIngredients(r.ingredients.join('\n'));
    setInstructions(r.instructions.join('\n'));
    setNotes(r.notes ?? '');
    setImportText('');
    setImportUrl('');
    setFoundRecipes(null);
    setShowImport(false);
  }

  async function runImport(payload) {
    setImporting(true);
    setError(null);
    try {
      const { recipes } = await api.extractRecipe(payload);
      if (recipes.length === 1) applyRecipe(recipes[0]);
      else setFoundRecipes(recipes);
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

  function addTag(raw) {
    const tag = raw.trim();
    if (tag && !tags.some((t) => t.toLowerCase() === tag.toLowerCase())) {
      setTags([...tags, tag]);
    }
    setTagInput('');
  }

  // Existing tags the recipe hasn't picked yet — offered as one-tap chips.
  const unusedSuggestions = tagSuggestions.filter(
    (s) => !tags.some((t) => t.toLowerCase() === s.toLowerCase()),
  );

  function onTagKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(tagInput);
    } else if (e.key === 'Backspace' && !tagInput && tags.length > 0) {
      setTags(tags.slice(0, -1));
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
      // Include a tag still sitting in the input so "type and hit Save" works.
      const pending = tagInput.trim();
      const savedTags =
        pending && !tags.some((t) => t.toLowerCase() === pending.toLowerCase())
          ? [...tags, pending]
          : tags;
      const data = {
        title,
        summary,
        servings: servings.trim(),
        categoryId: categoryId === '' ? null : Number(categoryId),
        tags: savedTags,
        ingredients: lines(ingredients),
        instructions: lines(instructions),
        notes: notes.trim(),
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
        (foundRecipes ? (
          <div className="import-panel">
            <span className="field-title">
              Found {foundRecipes.length} recipes — pick one
            </span>
            {foundRecipes.map((r, i) => (
              <button
                key={i}
                className="btn ghost small"
                type="button"
                onClick={() => applyRecipe(r)}
              >
                {r.title}
              </button>
            ))}
            <div className="form-actions import-actions">
              <button
                className="btn ghost small"
                type="button"
                onClick={() => setFoundRecipes(null)}
              >
                Back
              </button>
            </div>
          </div>
        ) : showImport ? (
          <div className="import-panel">
            <span className="field-title">Import from a URL, text, or photo</span>
            <div className="import-url-row">
              <input
                type="url"
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                placeholder="Link to a recipe page or Claude chat"
                disabled={importing}
              />
              <button
                className="btn ghost small"
                type="button"
                onClick={() => runImport({ url: importUrl.trim() })}
                disabled={importing || !importUrl.trim()}
              >
                {importing ? 'Reading…' : 'Extract from URL'}
              </button>
            </div>
            <textarea
              rows={4}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="…or paste recipe text here"
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
            Import from a URL, text, or photo
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
        Servings
        <input
          value={servings}
          onChange={(e) => setServings(e.target.value)}
          placeholder="e.g. 4"
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
      {/* Not a <label>: buttons are labelable, so a label would forward
          stray clicks to the first chip's remove button. */}
      <div className="tag-field">
        <span className="field-title">
          Tags <span className="hint-inline">press Enter after each</span>
        </span>
        <div className="tag-editor">
          {tags.map((t) => (
            <span key={t} className="tag">
              {t}
              <button
                type="button"
                aria-label={`Remove tag ${t}`}
                onClick={() => setTags(tags.filter((x) => x !== t))}
              >
                ×
              </button>
            </span>
          ))}
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={onTagKeyDown}
            placeholder={tags.length === 0 ? 'e.g. Wing Sauces' : ''}
          />
        </div>
        {unusedSuggestions.length > 0 && (
          <div className="tag-suggestions">
            {unusedSuggestions.map((s) => (
              <button
                key={s}
                type="button"
                className="tag-suggestion"
                onClick={() => addTag(s)}
              >
                + {s}
              </button>
            ))}
          </div>
        )}
      </div>
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
      <label>
        Notes <span className="hint-inline">tips, substitutions, anything</span>
        <textarea
          rows={4}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Doubles well. Swap butter for oil to make it dairy-free."
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
