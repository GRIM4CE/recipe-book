import { useState } from 'react';
import { api } from '../api.js';
import { useLanguage } from '../useLanguage.jsx';

function Row({ tag, onChanged }) {
  const { t } = useLanguage();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(tag.name);
  const [error, setError] = useState(null);

  async function run(action) {
    setError(null);
    try {
      await action();
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!editing) {
    return (
      <li className="tag-row">
        <span className="tag-name">{tag.name}</span>
        <span className="tag-count" title={t('usedBy', { n: tag.count })}>
          {tag.count}
        </span>
        <button className="btn ghost small" type="button" onClick={() => setEditing(true)}>
          {t('rename')}
        </button>
        <button
          className="btn danger small"
          type="button"
          onClick={() => run(() => api.deleteTag(tag.id))}
        >
          {t('delete')}
        </button>
        {error && <p className="error">{error}</p>}
      </li>
    );
  }

  return (
    <li className="tag-row editing">
      <input value={name} onChange={(e) => setName(e.target.value)} />
      <div className="form-actions">
        <button
          className="btn ghost small"
          type="button"
          onClick={() => {
            setName(tag.name);
            setEditing(false);
          }}
        >
          {t('cancel')}
        </button>
        <button
          className="btn primary small"
          type="button"
          onClick={() =>
            run(() => api.renameTag(tag.id, name.trim())).then(() => setEditing(false))
          }
        >
          {t('save')}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </li>
  );
}

export default function TagManager({ tags, onChanged }) {
  const { t } = useLanguage();
  return (
    <div className="tags-page">
      <h2>{t('tags')}</h2>
      {tags.length === 0 ? (
        <p className="notice">{t('noTags')}</p>
      ) : (
        <ul className="tag-list">
          {tags.map((tag) => (
            <Row key={tag.id} tag={tag} onChanged={onChanged} />
          ))}
        </ul>
      )}
    </div>
  );
}
