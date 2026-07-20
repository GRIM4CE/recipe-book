import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { currentUser, devMode, hasDevicePasskey, logout, registerPasskey } from './auth.js';
import Categories from './components/Categories.jsx';
import Login from './components/Login.jsx';
import RecipeDetail from './components/RecipeDetail.jsx';
import RecipeForm from './components/RecipeForm.jsx';
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
  const [user, setUser] = useState(currentUser);
  const [offerPasskey, setOfferPasskey] = useState(false);
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

  useEffect(() => {
    setOfferPasskey(Boolean(user) && !devMode && !hasDevicePasskey());
  }, [user]);

  async function addPasskey() {
    try {
      await registerPasskey();
      setOfferPasskey(false);
    } catch (err) {
      window.alert(err.message);
    }
  }

  function onSaved(recipe) {
    reload();
    window.location.hash = `#/recipes/${recipe.id}`;
  }

  async function onDeleteRecipe(recipe) {
    if (!window.confirm(`Delete “${recipe.title}”?`)) return;
    try {
      await api.deleteRecipe(recipe.id);
      reload();
      window.location.hash = '#/';
    } catch (err) {
      window.alert(err.message);
    }
  }

  function signOut() {
    logout();
    setUser(null);
    window.location.hash = '#/';
  }

  // The sign-in link renders only where the owner plausibly is: local dev, the
  // installed PWA, or a browser that has already used a passkey. Visitors never
  // see it; a fresh browser can still reach #/login by typing the URL.
  const showSignIn =
    devMode || hasDevicePasskey() || window.matchMedia('(display-mode: standalone)').matches;

  const tagSuggestions = [...new Set((recipes ?? []).flatMap((r) => r.tags ?? []))].sort(
    (a, b) => a.localeCompare(b),
  );

  const detailMatch = route.match(/^\/recipes\/(\d+)$/);
  const editMatch = route.match(/^\/recipes\/(\d+)\/edit$/);
  const findRecipe = (id) => recipes?.find((r) => r.id === Number(id));

  let page;
  if (error) {
    page = <p className="notice">Couldn’t load recipes: {error}</p>;
  } else if (route === '/login') {
    page = <Login onLogin={setUser} />;
  } else if (recipes === null) {
    page = <p className="notice">Loading…</p>;
  } else if (route === '/new') {
    page = user ? (
      <RecipeForm categories={categories} tagSuggestions={tagSuggestions} onSaved={onSaved} />
    ) : (
      <Login onLogin={setUser} />
    );
  } else if (editMatch) {
    const recipe = findRecipe(editMatch[1]);
    page = !user ? (
      <Login onLogin={setUser} />
    ) : recipe ? (
      <RecipeForm
        recipe={recipe}
        categories={categories}
        tagSuggestions={tagSuggestions}
        onSaved={onSaved}
      />
    ) : (
      <p className="notice">That recipe doesn’t exist (anymore).</p>
    );
  } else if (route === '/categories') {
    page = user ? (
      <Categories categories={categories} onChanged={reload} />
    ) : (
      <Login onLogin={setUser} />
    );
  } else if (detailMatch) {
    const recipe = findRecipe(detailMatch[1]);
    page = recipe ? (
      <RecipeDetail recipe={recipe} canEdit={Boolean(user)} onDelete={onDeleteRecipe} />
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
        <nav className="nav">
          {user ? (
            <>
              <a className="btn primary small" href="#/new">+ Recipe</a>
              <a className="btn ghost small" href="#/categories">Categories</a>
              <button className="btn ghost small" type="button" onClick={signOut}>
                Sign out
              </button>
            </>
          ) : showSignIn ? (
            <a className="btn ghost small" href="#/login">Sign in</a>
          ) : null}
        </nav>
      </header>
      <main>
        {offerPasskey && (
          <p className="notice">
            Add a passkey to sign in with just Face ID / fingerprint next time.{' '}
            <button className="btn primary small" type="button" onClick={addPasskey}>
              Add passkey
            </button>{' '}
            <button className="btn ghost small" type="button" onClick={() => setOfferPasskey(false)}>
              Not now
            </button>
          </p>
        )}
        {page}
      </main>
    </div>
  );
}
