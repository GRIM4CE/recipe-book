import { useState } from 'react';
import { useDismiss } from '../useDismiss.js';
import { useLanguage } from '../useLanguage.jsx';
import Icon from './Icon.jsx';

const ITEMS = [
  { href: '#/new', icon: 'book-open', label: 'newRecipeTitle' },
  { href: '#/categories', icon: 'palette', label: 'editCategories' },
  { href: '#/tags', icon: 'hash', label: 'editTags' },
];

// The header's one "+": everything that creates or organises lives behind it,
// so the wordmark stays the loudest thing at the top of the book.
export default function AddMenu() {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  return (
    <div className="popover-anchor" ref={ref}>
      <button
        type="button"
        className="icon-btn outlined"
        aria-label={t('add')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Icon name="plus" />
      </button>
      {open && (
        <div className="menu" role="menu" aria-label={t('add')}>
          {ITEMS.map((item) => (
            <a
              key={item.href}
              className="menu-item"
              role="menuitem"
              href={item.href}
              onClick={() => setOpen(false)}
            >
              <Icon name={item.icon} />
              {t(item.label)}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
