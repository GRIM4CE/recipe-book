import { useState } from 'react';
import { api } from '../api.js';

const PALETTE = [
  '#E85D4C',
  '#F2A93B',
  '#E8618C',
  '#4C9BE8',
  '#58B368',
  '#9B6BD4',
  '#3AAFA9',
  '#C97B4A',
];

function Swatches({ value, onPick }) {
  return (
    <div className="swatches">
      {PALETTE.map((color) => (
        <button
          key={color}
          type="button"
          className={value === color ? 'swatch active' : 'swatch'}
          style={{ '--swatch': color }}
          onClick={() => onPick(color)}
          aria-label={`Color ${color}`}
        />
      ))}
    </div>
  );
}

function Row({ category, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [color, setColor] = useState(category.color);
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
      <li className="category-row">
        <span className="swatch static" style={{ '--swatch': category.color }} />
        <span className="category-name">{category.name}</span>
        <button className="btn ghost small" type="button" onClick={() => setEditing(true)}>
          Edit
        </button>
        <button
          className="btn danger small"
          type="button"
          onClick={() => run(() => api.deleteCategory(category.id))}
        >
          Delete
        </button>
        {error && <p className="error">{error}</p>}
      </li>
    );
  }

  return (
    <li className="category-row editing">
      <input value={name} onChange={(e) => setName(e.target.value)} />
      <Swatches value={color} onPick={setColor} />
      <div className="form-actions">
        <button className="btn ghost small" type="button" onClick={() => setEditing(false)}>
          Cancel
        </button>
        <button
          className="btn primary small"
          type="button"
          onClick={() =>
            run(() => api.updateCategory(category.id, { name, color })).then(() =>
              setEditing(false),
            )
          }
        >
          Save
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </li>
  );
}

export default function Categories({ categories, onChanged }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(PALETTE[0]);
  const [error, setError] = useState(null);

  async function add(e) {
    e.preventDefault();
    setError(null);
    try {
      await api.createCategory({ name: name.trim(), color });
      setName('');
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="categories-page">
      <h2>Categories</h2>
      <ul className="category-list">
        {categories.map((c) => (
          <Row key={c.id} category={c} onChanged={onChanged} />
        ))}
      </ul>
      <form className="form category-add" onSubmit={add}>
        <h3>Add category</h3>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <Swatches value={color} onPick={setColor} />
        {error && <p className="error">{error}</p>}
        <button className="btn primary" type="submit">
          Add
        </button>
      </form>
    </div>
  );
}
