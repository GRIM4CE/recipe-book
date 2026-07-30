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
  listTags: () => req('/api/tags').then((b) => b.tags),

  createRecipe: (data) => authed('/api/recipes', { method: 'POST', body: json(data) }),
  updateRecipe: (id, data) =>
    authed(`/api/recipes/${id}`, { method: 'PUT', body: json(data) }),
  deleteRecipe: (id) => authed(`/api/recipes/${id}`, { method: 'DELETE' }),
  duplicateRecipe: (id) => authed(`/api/recipes/${id}/duplicate`, { method: 'POST' }),

  // Presign, PUT the bytes directly to storage, return the stored key.
  uploadPhoto: async (blob) => {
    const { uploadUrl, key } = await authed('/api/uploads', { method: 'POST' });
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      body: blob,
    });
    if (!res.ok) throw new Error('Photo upload failed');
    return key;
  },

  // Turn pasted text or a photographed recipe into prefilled form fields.
  extractRecipe: (data) => authed('/api/extract', { method: 'POST', body: json(data) }),

  createCategory: (data) =>
    authed('/api/categories', { method: 'POST', body: json(data) }),
  updateCategory: (id, data) =>
    authed(`/api/categories/${id}`, { method: 'PUT', body: json(data) }),
  deleteCategory: (id) => authed(`/api/categories/${id}`, { method: 'DELETE' }),

  renameTag: (id, name) =>
    authed(`/api/tags/${id}`, { method: 'PUT', body: json({ name }) }),
  deleteTag: (id) => authed(`/api/tags/${id}`, { method: 'DELETE' }),
};
