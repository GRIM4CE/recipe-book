import type { Client, Row } from "@libsql/client";
import { SCHEMA } from "./db/schema.js";
import type { Category, Recipe, RecipeInput, RecipeSource } from "./types.js";

export interface RecipeMeta {
  createdBy: string;
  source: RecipeSource;
}

export type CategoryDeleteResult = "deleted" | "in_use" | "missing";

function rowToCategory(row: Row): Category {
  return {
    id: Number(row.id),
    name: String(row.name),
    color: String(row.color),
    createdAt: String(row.created_at),
  };
}

function rowToRecipe(row: Row, tags: string[]): Recipe {
  return {
    id: Number(row.id),
    title: String(row.title),
    summary: String(row.summary),
    ingredients: JSON.parse(String(row.ingredients)),
    instructions: JSON.parse(String(row.instructions)),
    category:
      row.c_id == null
        ? null
        : {
            id: Number(row.c_id),
            name: String(row.c_name),
            color: String(row.c_color),
            createdAt: String(row.c_created_at),
          },
    tags,
    photoKey: row.photo_key == null ? null : String(row.photo_key),
    createdBy: String(row.created_by),
    source: String(row.source) as RecipeSource,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

const RECIPE_SELECT = `
  SELECT r.*, c.id AS c_id, c.name AS c_name, c.color AS c_color,
         c.created_at AS c_created_at
  FROM recipes r LEFT JOIN categories c ON r.category_id = c.id
`;

export function createDb(client: Client) {
  // Tags are created on the fly: each name is matched case-insensitively
  // against existing tags and inserted only when new.
  async function setRecipeTags(recipeId: number, names: string[]): Promise<void> {
    await client.execute({
      sql: "DELETE FROM recipe_tags WHERE recipe_id = ?",
      args: [recipeId],
    });
    for (const name of names) {
      const found = await client.execute({
        sql: "SELECT id FROM tags WHERE name = ? COLLATE NOCASE",
        args: [name],
      });
      let tagId = found.rows[0] ? Number(found.rows[0].id) : null;
      if (tagId == null) {
        const inserted = await client.execute({
          sql: "INSERT INTO tags (name, created_at) VALUES (?, ?)",
          args: [name, new Date().toISOString()],
        });
        tagId = Number(inserted.lastInsertRowid);
      }
      await client.execute({
        sql: "INSERT OR IGNORE INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)",
        args: [recipeId, tagId],
      });
    }
  }

  async function tagsByRecipe(): Promise<Map<number, string[]>> {
    const rs = await client.execute(
      `SELECT rt.recipe_id, t.name FROM recipe_tags rt
       JOIN tags t ON rt.tag_id = t.id ORDER BY t.name COLLATE NOCASE`,
    );
    const map = new Map<number, string[]>();
    for (const row of rs.rows) {
      const id = Number(row.recipe_id);
      map.set(id, [...(map.get(id) ?? []), String(row.name)]);
    }
    return map;
  }

  return {
    async applySchema(): Promise<void> {
      await client.executeMultiple(SCHEMA);
    },

    async listCategories(): Promise<Category[]> {
      const rs = await client.execute("SELECT * FROM categories ORDER BY name");
      return rs.rows.map(rowToCategory);
    },

    async getCategory(id: number): Promise<Category | null> {
      const rs = await client.execute({
        sql: "SELECT * FROM categories WHERE id = ?",
        args: [id],
      });
      return rs.rows[0] ? rowToCategory(rs.rows[0]) : null;
    },

    async getCategoryByName(name: string): Promise<Category | null> {
      const rs = await client.execute({
        sql: "SELECT * FROM categories WHERE name = ? COLLATE NOCASE",
        args: [name],
      });
      return rs.rows[0] ? rowToCategory(rs.rows[0]) : null;
    },

    async createCategory(input: { name: string; color: string }): Promise<Category> {
      const createdAt = new Date().toISOString();
      const rs = await client.execute({
        sql: "INSERT INTO categories (name, color, created_at) VALUES (?, ?, ?)",
        args: [input.name, input.color, createdAt],
      });
      return { id: Number(rs.lastInsertRowid), ...input, createdAt };
    },

    async updateCategory(
      id: number,
      input: { name: string; color: string },
    ): Promise<Category | null> {
      const rs = await client.execute({
        sql: "UPDATE categories SET name = ?, color = ? WHERE id = ?",
        args: [input.name, input.color, id],
      });
      if (rs.rowsAffected === 0) return null;
      return this.getCategory(id);
    },

    async deleteCategory(id: number): Promise<CategoryDeleteResult> {
      const inUse = await client.execute({
        sql: "SELECT COUNT(*) AS n FROM recipes WHERE category_id = ?",
        args: [id],
      });
      if (Number(inUse.rows[0].n) > 0) return "in_use";
      const rs = await client.execute({
        sql: "DELETE FROM categories WHERE id = ?",
        args: [id],
      });
      return rs.rowsAffected === 0 ? "missing" : "deleted";
    },

    async listRecipes(): Promise<Recipe[]> {
      const rs = await client.execute(`${RECIPE_SELECT} ORDER BY r.created_at DESC`);
      const tags = await tagsByRecipe();
      return rs.rows.map((row) => rowToRecipe(row, tags.get(Number(row.id)) ?? []));
    },

    async getRecipe(id: number): Promise<Recipe | null> {
      const rs = await client.execute({
        sql: `${RECIPE_SELECT} WHERE r.id = ?`,
        args: [id],
      });
      if (!rs.rows[0]) return null;
      const tags = await client.execute({
        sql: `SELECT t.name FROM recipe_tags rt JOIN tags t ON rt.tag_id = t.id
              WHERE rt.recipe_id = ? ORDER BY t.name COLLATE NOCASE`,
        args: [id],
      });
      return rowToRecipe(
        rs.rows[0],
        tags.rows.map((r) => String(r.name)),
      );
    },

    async createRecipe(input: RecipeInput, meta: RecipeMeta): Promise<Recipe> {
      const now = new Date().toISOString();
      const rs = await client.execute({
        sql: `INSERT INTO recipes
          (title, summary, ingredients, instructions, category_id, photo_key,
           created_by, source, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          input.title,
          input.summary ?? "",
          JSON.stringify(input.ingredients ?? []),
          JSON.stringify(input.instructions ?? []),
          input.categoryId ?? null,
          input.photoKey ?? null,
          meta.createdBy,
          meta.source,
          now,
          now,
        ],
      });
      const id = Number(rs.lastInsertRowid);
      if (input.tags?.length) await setRecipeTags(id, input.tags);
      return (await this.getRecipe(id)) as Recipe;
    },

    async updateRecipe(id: number, input: RecipeInput): Promise<Recipe | null> {
      const rs = await client.execute({
        sql: `UPDATE recipes SET title = ?, summary = ?, ingredients = ?,
          instructions = ?, category_id = ?, photo_key = ?, updated_at = ?
          WHERE id = ?`,
        args: [
          input.title,
          input.summary ?? "",
          JSON.stringify(input.ingredients ?? []),
          JSON.stringify(input.instructions ?? []),
          input.categoryId ?? null,
          input.photoKey ?? null,
          new Date().toISOString(),
          id,
        ],
      });
      if (rs.rowsAffected === 0) return null;
      await setRecipeTags(id, input.tags ?? []);
      return this.getRecipe(id);
    },

    async deleteRecipe(id: number): Promise<boolean> {
      await client.execute({
        sql: "DELETE FROM recipe_tags WHERE recipe_id = ?",
        args: [id],
      });
      const rs = await client.execute({
        sql: "DELETE FROM recipes WHERE id = ?",
        args: [id],
      });
      return rs.rowsAffected > 0;
    },
  };
}

export type Db = ReturnType<typeof createDb>;
