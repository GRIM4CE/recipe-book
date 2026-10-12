import { useState } from 'react';
import { api } from '../api.js';
import { useLanguage } from '../useLanguage.jsx';
import Icon from './Icon.jsx';

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
  const { t } = useLanguage();
  return (
    <div className="swatches">
      {PALETTE.map((color) => (
        <button
          key={color}
          type="button"
          className={value === color ? 'swatch active' : 'swatch'}
          style={{ '--swatch': color }}
          onClick={() => onPick(color)}
          aria-label={t('colorLabel', { color })}
        />
      ))}
    </div>
  );
}

function Row({ category, onChanged }) {
  const { t } = useLanguage();
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
          {t('edit')}
        </button>
        <button
          className="btn danger small"
          type="button"
          onClick={() => run(() => api.deleteCategory(category.id))}
        >
          {t('delete')}
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
          {t('cancel')}
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
          {t('save')}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </li>
  );
}

export default function Categories({ categories, onChanged }) {
  const { t } = useLanguage();
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
      {/* Reached from the header's + menu and from Settings: back goes to
          whichever it was. */}
      <button className="btn outline back" type="button" onClick={() => window.history.back()}>
        <Icon name="chevron-left" size={16} />
        {t('back')}
      </button>
      <h2>{t('categories')}</h2>
      <ul className="category-list">
        {categories.map((c) => (
          <Row key={c.id} category={c} onChanged={onChanged} />
        ))}
      </ul>
      <form className="form category-add" onSubmit={add}>
        <h3>{t('addCategory')}</h3>
        <label>
          {t('name')}
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <Swatches value={color} onPick={setColor} />
        {error && <p className="error">{error}</p>}
        <button className="btn primary" type="submit">
          {t('add')}
        </button>
      </form>
    </div>
  );
}
