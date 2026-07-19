import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import RecipeDetail from './components/RecipeDetail.jsx';
import RecipeGrid from './components/RecipeGrid.jsx';

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

  const detailMatch = route.match(/^\/recipes\/(\d+)$/);

  let page;
  if (error) {
    page = <p className="notice">Couldn’t load recipes: {error}</p>;
  } else if (recipes === null) {
    page = <p className="notice">Loading…</p>;
  } else if (detailMatch) {
    const recipe = recipes.find((r) => r.id === Number(detailMatch[1]));
    page = recipe ? (
      <RecipeDetail recipe={recipe} />
    ) : (
      <p className="notice">That recipe doesn’t exist (anymore).</p>
    );
  } else {
    page = <RecipeGrid recipes={recipes} categories={categories} />;
  }

  return (
    <div className="app">
      <header className="header">
        <a href="#/" className="wordmark">Recipe Book</a>
      </header>
      <main>{page}</main>
    </div>
  );
}
