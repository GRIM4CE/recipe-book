import { useState } from 'react';
import { api } from '../api.js';

function Row({ tag, onChanged }) {
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
        <span className="tag-count" title={`Used by ${tag.count} recipes`}>
          {tag.count}
        </span>
        <button className="btn ghost small" type="button" onClick={() => setEditing(true)}>
          Rename
        </button>
        <button
          className="btn danger small"
          type="button"
          onClick={() => run(() => api.deleteTag(tag.id))}
        >
          Delete
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
          Cancel
        </button>
        <button
          className="btn primary small"
          type="button"
          onClick={() =>
            run(() => api.renameTag(tag.id, name.trim())).then(() => setEditing(false))
          }
        >
          Save
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </li>
  );
}

export default function TagManager({ tags, onChanged }) {
  return (
    <div className="tags-page">
      <h2>Tags</h2>
      {tags.length === 0 ? (
        <p className="notice">No tags yet. Add tags to a recipe and they’ll show up here.</p>
      ) : (
        <ul className="tag-list">
          {tags.map((t) => (
            <Row key={t.id} tag={t} onChanged={onChanged} />
          ))}
        </ul>
      )}
    </div>
  );
}
