// Embedded as a string (not a .sql file) so it survives both tsc output and
// the Lambda esbuild bundle without copy steps. Idempotent: applied at
// startup/seed, no migration framework at household scale.
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recipes (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  servings TEXT NOT NULL DEFAULT '',
  ingredients TEXT NOT NULL DEFAULT '[]',
  instructions TEXT NOT NULL DEFAULT '[]',
  category_id INTEGER REFERENCES categories(id),
  photo_key TEXT,
  created_by TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'web',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;
