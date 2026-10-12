import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { currentUser, devMode, hasDevicePasskey, logout, registerPasskey } from './auth.js';
import { localizeRecipe, recipeLanguage } from './i18n.js';
import Categories from './components/Categories.jsx';
import LanguageSwitch from './components/LanguageSwitch.jsx';
import Login from './components/Login.jsx';
import RecipeDetail from './components/RecipeDetail.jsx';
import RecipeForm from './components/RecipeForm.jsx';
import RecipeGrid from './components/RecipeGrid.jsx';
import Settings from './components/Settings.jsx';
import TagManager from './components/TagManager.jsx';
import { useLanguage } from './useLanguage.jsx';

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
  const { lang, t } = useLanguage();
  const route = useHashRoute();
  const [user, setUser] = useState(currentUser);
  const [offerPasskey, setOfferPasskey] = useState(false);
  const [recipes, setRecipes] = useState(null);
  const [categories, setCategories] = useState([]);
  const [tags, setTags] = useState([]);
  const [error, setError] = useState(null);
  // Held here, not in RecipeGrid, so opening a recipe and coming back lands on
  // the list exactly as it was left.
  const [filters, setFilters] = useState({
    query: '',
    categoryId: null,
    tag: null,
    ingredient: '',
    filtersOpen: false,
  });
  const listScroll = useRef(0);
  // Per-recipe language picks, kept here so a choice made on a card survives
  // opening the recipe and coming back. Not saved: a reload starts from the
  // reader's default again.
  const [overrides, setOverrides] = useState({});
  // Recipes being translated right now, by id.
  const [inFlight, setInFlight] = useState(() => new Set());

  const reload = useCallback(() => {
    return Promise.all([api.listRecipes(), api.listCategories(), api.listTags()])
      .then(([r, c, t]) => {
        setRecipes(r);
        setCategories(c);
        setTags(t);
        setError(null);
      })
      .catch((err) => setError(err.message));
  }, []);

  // Wrapped: reload returns a promise now, and an effect may only return a
  // cleanup function.
  useEffect(() => {
    reload();
  }, [reload]);

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

  // Nothing is translated here: a translation is made when someone picks that
  // language on the recipe (see onViewLanguage).
  function onSaved(recipe) {
    reload();
    window.location.hash = `#/recipes/${recipe.id}`;
  }

  async function onTranslateRecipe(recipe) {
    try {
      await api.translateRecipe(recipe.id);
      await reload();
    } catch (err) {
      window.alert(err.message);
    }
  }

  // A language the recipe already has just switches the view. One it doesn't
  // is translated first (signed in only; the switch greys it out otherwise).
  async function onViewLanguage(recipe, language) {
    const setView = () => setOverrides((o) => ({ ...o, [recipe.id]: language }));
    if (language === recipe.language || recipe.translations?.[language]) {
      setView();
      return;
    }
    if (!user) return;
    setInFlight((s) => new Set(s).add(recipe.id));
    try {
      await api.translateRecipe(recipe.id);
      await reload();
      setView();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setInFlight((s) => {
        const next = new Set(s);
        next.delete(recipe.id);
        return next;
      });
    }
  }

  // Lands on the copy's edit form: duplicating is how you start a variation,
  // so the next step is always changing something.
  async function onDuplicateRecipe(recipe) {
    try {
      const copy = await api.duplicateRecipe(recipe.id);
      await reload();
      window.location.hash = `#/recipes/${copy.id}/edit`;
    } catch (err) {
      window.alert(err.message);
    }
  }

  // Confirmation is handled by the edit form's modal before this runs.
  async function onDeleteRecipe(recipe) {
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

  // What readers see: each recipe in its own language, which is the reader's
  // default (the header switch) unless they picked another for that recipe. The
  // form edits the untouched `recipes` instead, so a translation is never saved
  // as the source.
  const shown = recipes?.map((r) => {
    const viewLanguage = recipeLanguage(r, lang, overrides[r.id]);
    return { ...localizeRecipe(r, viewLanguage), viewLanguage };
  });

  const tagSuggestions = [...new Set((shown ?? []).flatMap((r) => r.tags ?? []))].sort(
    (a, b) => a.localeCompare(b),
  );

  const detailMatch = route.match(/^\/recipes\/(\d+)$/);
  const editMatch = route.match(/^\/recipes\/(\d+)\/edit$/);
  const findRecipe = (id, list = recipes) => list?.find((r) => r.id === Number(id));

  let page;
  if (error) {
    page = <p className="notice">{t('loadError', { error })}</p>;
  } else if (route === '/login') {
    page = <Login onLogin={setUser} />;
  } else if (recipes === null) {
    page = <p className="notice">{t('loading')}</p>;
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
        onDelete={onDeleteRecipe}
      />
    ) : (
      <p className="notice">{t('recipeMissing')}</p>
    );
  } else if (route === '/categories') {
    page = user ? (
      <Categories categories={categories} onChanged={reload} />
    ) : (
      <Login onLogin={setUser} />
    );
  } else if (route === '/tags') {
    page = user ? (
      <TagManager tags={tags} onChanged={reload} />
    ) : (
      <Login onLogin={setUser} />
    );
  } else if (route === '/settings') {
    page = user ? (
      <Settings user={user} onSignOut={signOut} />
    ) : (
      <Login onLogin={setUser} />
    );
  } else if (detailMatch) {
    const recipe = findRecipe(detailMatch[1], shown);
    page = recipe ? (
      <RecipeDetail
        recipe={recipe}
        recipes={shown}
        canEdit={Boolean(user)}
        busy={inFlight.has(recipe.id)}
        onDuplicate={onDuplicateRecipe}
        onTranslate={onTranslateRecipe}
        onViewLanguage={onViewLanguage}
      />
    ) : (
      <p className="notice">{t('recipeMissing')}</p>
    );
  } else {
    page = (
      <RecipeGrid
        recipes={shown}
        categories={categories}
        filters={filters}
        onFilters={setFilters}
        scrollRef={listScroll}
        canEdit={Boolean(user)}
        inFlight={inFlight}
        onViewLanguage={onViewLanguage}
      />
    );
  }

  // A recipe fills the screen on its own: no wordmark, no nav, just the card
  // and its own back button.
  const bare = Boolean(detailMatch) && !error;

  return (
    <div className={bare ? 'app bare' : 'app'}>
      {!bare && (
        <header className="header">
          <a href="#/" className="wordmark">{t('appName')}</a>
          <nav className="nav">
            <LanguageSwitch />
            {user ? (
              <>
                <a className="btn primary small" href="#/new">{t('newRecipe')}</a>
                <a className="btn ghost small" href="#/categories">{t('categories')}</a>
                <a className="btn ghost small" href="#/tags">{t('tags')}</a>
                <a className="icon-btn" href="#/settings" aria-label={t('settings')} title={t('settings')}>
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
                    <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5Z" />
                  </svg>
                </a>
              </>
            ) : showSignIn ? (
              <a className="btn ghost small" href="#/login">{t('signIn')}</a>
            ) : null}
          </nav>
        </header>
      )}
      <main>
        {offerPasskey && (
          <p className="notice">
            {t('passkeyOffer')}{' '}
            <button className="btn primary small" type="button" onClick={addPasskey}>
              {t('addPasskey')}
            </button>{' '}
            <button className="btn ghost small" type="button" onClick={() => setOfferPasskey(false)}>
              {t('notNow')}
            </button>
          </p>
        )}
        {page}
      </main>
    </div>
  );
}
