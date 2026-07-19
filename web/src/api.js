import { getAccessToken } from './auth.js';

const BASE = import.meta.env.VITE_API_BASE_URL ?? '';

async function req(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    let message = `${res.status}`;
    try {
      message = (await res.json()).error ?? message;
    } catch {
      // non-JSON error body; keep the status code
    }
    throw new Error(message);
  }
  return res.status === 204 ? null : res.json();
}

async function authed(path, options = {}) {
  const token = await getAccessToken();
  if (!token) throw new Error('You need to sign in first');
  return req(path, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options.headers },
  });
}

const json = (body) => JSON.stringify(body);

export const api = {
  listRecipes: () => req('/api/recipes').then((b) => b.recipes),
  getRecipe: (id) => req(`/api/recipes/${id}`),
  listCategories: () => req('/api/categories').then((b) => b.categories),

  createRecipe: (data) => authed('/api/recipes', { method: 'POST', body: json(data) }),
  updateRecipe: (id, data) =>
    authed(`/api/recipes/${id}`, { method: 'PUT', body: json(data) }),
  deleteRecipe: (id) => authed(`/api/recipes/${id}`, { method: 'DELETE' }),

  createCategory: (data) =>
    authed('/api/categories', { method: 'POST', body: json(data) }),
  updateCategory: (id, data) =>
    authed(`/api/categories/${id}`, { method: 'PUT', body: json(data) }),
  deleteCategory: (id) => authed(`/api/categories/${id}`, { method: 'DELETE' }),
};
