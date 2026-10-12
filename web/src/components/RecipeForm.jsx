import { useState } from 'react';
import { api } from '../api.js';
import { blobToBase64, downscaleToJpeg } from '../image.js';
import { describeImportError } from '../importError.js';
import { LANGUAGES, LANGUAGE_NAMES } from '../i18n.js';
import { useLanguage } from '../useLanguage.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
const lines = (text) =>
  text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

// One line per ingredient/step: far friendlier on a phone than dynamic rows.
export default function RecipeForm({ recipe, categories, tagSuggestions = [], onSaved, onDelete }) {
  const { lang, t } = useLanguage();
  const [title, setTitle] = useState(recipe?.title ?? '');
  const [summary, setSummary] = useState(recipe?.summary ?? '');
  const [servings, setServings] = useState(recipe?.servings ?? '');
  const [language, setLanguage] = useState(recipe?.language ?? lang);
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
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Import panel: only offered when creating, collapses after a successful
  // extraction.
  const [showImport, setShowImport] = useState(!recipe);
  const [importText, setImportText] = useState('');
  // While an extraction runs: a short line saying what is being read, null
  // when idle. Failures land in importError, shown inside the panel so they
  // are visible next to the button that was tapped.
  const [importing, setImporting] = useState(null);
  const [importError, setImportError] = useState(null);
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
    if (LANGUAGES.includes(r.language)) setLanguage(r.language);
    setCategoryId(r.categoryId ?? '');
    setIngredients(r.ingredients.join('\n'));
    setInstructions(r.instructions.join('\n'));
    setNotes(r.notes ?? '');
    setImportText('');
    setImportUrl('');
    setFoundRecipes(null);
    setShowImport(false);
  }

  async function runImport(payload, status) {
    setImporting(status);
    setImportError(null);
    try {
      const { recipes } = await api.extractRecipe(payload);
      if (recipes.length === 1) applyRecipe(recipes[0]);
      else setFoundRecipes(recipes);
    } catch (err) {
      setImportError(describeImportError(err, t));
    } finally {
      setImporting(null);
    }
  }

  async function importFromPhoto(e) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    e.target.value = '';
    const status =
      files.length === 1 ? t('readingPhoto') : t('readingPhotos', { n: files.length });
    setImporting(status);
    setImportError(null);
    try {
      // Read every picked photo together — pages of one recipe or a batch.
      const images = await Promise.all(
        files.map(async (file) => blobToBase64(await downscaleToJpeg(file))),
      );
      await runImport({ images, mediaType: 'image/jpeg' }, status);
    } catch (err) {
      setImportError(describeImportError(err, t));
      setImporting(null);
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
        language,
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
      <h2>{recipe ? t('editRecipe') : t('newRecipeTitle')}</h2>
      {!recipe &&
        (foundRecipes ? (
          <div className="import-panel">
            <span className="field-title">
              {t('importFound', { n: foundRecipes.length })}
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
                {t('back')}
              </button>
            </div>
          </div>
        ) : showImport ? (
          <div className="import-panel">
            <span className="field-title">{t('importTitle')}</span>
            <div className="import-url-row">
              <input
                type="url"
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                placeholder={t('importUrlPlaceholder')}
                disabled={!!importing}
              />
              <button
                className="btn ghost small"
                type="button"
                onClick={() =>
                  runImport({ url: importUrl.trim() }, t('readingPage'))
                }
                disabled={!!importing || !importUrl.trim()}
              >
                {t('extractUrl')}
              </button>
            </div>
            <textarea
              rows={4}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={t('importTextPlaceholder')}
              disabled={!!importing}
            />
            <div className="form-actions import-actions">
              <button
                className="btn ghost small"
                type="button"
                onClick={() => runImport({ text: importText }, t('readingText'))}
                disabled={!!importing || !importText.trim()}
              >
                {t('extractText')}
              </button>
              <label className="btn ghost small">
                {t('extractPhotos')}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={importFromPhoto}
                  hidden
                  disabled={!!importing}
                />
              </label>
            </div>
            {importing && (
              <p className="import-status" role="status">
                <span className="spinner" aria-hidden="true" />
                <span>
                  {importing}{' '}
                  <span className="hint-inline">{t('importWait')}</span>
                </span>
              </p>
            )}
            {importError && (
              <p className="import-status error" role="alert">
                {importError}
              </p>
            )}
          </div>
        ) : (
          <button
            className="btn ghost small"
            type="button"
            onClick={() => setShowImport(true)}
          >
            {t('importTitle')}
          </button>
        ))}
      <label>
        {t('title')}
        <input value={title} onChange={(e) => setTitle(e.target.value)} required />
      </label>
      <label>
        {t('summary')}
        <input
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder={t('summaryPlaceholder')}
        />
      </label>
      <label>
        {t('servings')}
        <input
          value={servings}
          onChange={(e) => setServings(e.target.value)}
          placeholder={t('servingsPlaceholder')}
        />
      </label>
      <label>
        {t('language')}
        <select value={language} onChange={(e) => setLanguage(e.target.value)}>
          {LANGUAGES.map((code) => (
            <option key={code} value={code}>
              {LANGUAGE_NAMES[code]}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('category')}
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">{t('none')}</option>
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
          {t('tags')} <span className="hint-inline">{t('tagsHint')}</span>
        </span>
        <div className="tag-editor">
          {tags.map((tag) => (
            <span key={tag} className="tag">
              {tag}
              <button
                type="button"
                aria-label={t('removeTag', { tag })}
                onClick={() => setTags(tags.filter((x) => x !== tag))}
              >
                ×
              </button>
            </span>
          ))}
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={onTagKeyDown}
            placeholder={tags.length === 0 ? t('tagPlaceholder') : ''}
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
        <span className="field-title">{t('photo')}</span>
        {photoPreview && <img className="photo-preview" src={photoPreview} alt="" />}
        <div className="form-actions photo-actions">
          <label className="btn ghost small">
            {photoPreview ? t('replacePhoto') : t('addPhoto')}
            <input type="file" accept="image/*" onChange={pickPhoto} hidden />
          </label>
          {photoPreview && (
            <button className="btn danger small" type="button" onClick={removePhoto}>
              {t('remove')}
            </button>
          )}
        </div>
      </div>
      <label>
        {t('ingredients')} <span className="hint-inline">{t('onePerLine')}</span>
        <textarea
          className="ingredients-input"
          rows={8}
          value={ingredients}
          onChange={(e) => setIngredients(e.target.value)}
          placeholder={t('ingredientsPlaceholder')}
        />
      </label>
      <label>
        {t('instructions')} <span className="hint-inline">{t('onePerStep')}</span>
        <textarea
          rows={8}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder={t('instructionsPlaceholder')}
        />
      </label>
      <label>
        {t('notes')} <span className="hint-inline">{t('notesHint')}</span>
        <textarea
          rows={4}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t('notesPlaceholder')}
        />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="form-actions">
        {recipe && onDelete && (
          <button
            className="btn danger delete-action"
            type="button"
            onClick={() => setConfirmingDelete(true)}
          >
            {t('delete')}
          </button>
        )}
        <a className="btn ghost" href={recipe ? `#/recipes/${recipe.id}` : '#/'}>
          {t('cancel')}
        </a>
        <button className="btn primary" type="submit" disabled={busy || !!importing}>
          {busy ? t('saving') : t('saveRecipe')}
        </button>
      </div>
      <ConfirmDialog
        open={confirmingDelete}
        title={t('deleteTitle', { title: recipe?.title })}
        message={t('deleteMessage')}
        onConfirm={() => {
          setConfirmingDelete(false);
          onDelete(recipe);
        }}
        onCancel={() => setConfirmingDelete(false)}
      />
    </form>
  );
}
