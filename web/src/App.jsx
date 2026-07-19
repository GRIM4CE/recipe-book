import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';

// Hash routing keeps the SPA deployable without rewrite rules: the path after
// '#' is the route, e.g. #/recipes/12.
export function useHashRoute() {
  const read = () => window.location.hash.replace(/^#/, '') || '/';
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onChange = () => setRoute(read());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export default function App() {
  const route = useHashRoute();
  const [recipes, setRecipes] = useState(null);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState(null);

  const reload = useCallback(() => {
    Promise.all([api.listRecipes(), api.listCategories()])
      .then(([r, c]) => {
        setRecipes(r);
        setCategories(c);
        setError(null);
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(reload, [reload]);

  return (
    <div className="app">
      <header className="header">
        <a href="#/" className="wordmark">Recipe Book</a>
      </header>
      <main>
        {error && <p className="notice">Couldn’t load recipes: {error}</p>}
        {!error && recipes === null && <p className="notice">Loading…</p>}
        {recipes !== null && (
          <ul>
            {recipes.map((r) => (
              <li key={r.id}>
                {r.title}
                {r.category ? ` — ${r.category.name}` : ''}
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
