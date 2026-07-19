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

function rowToRecipe(row: Row): Recipe {
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
      return rs.rows.map(rowToRecipe);
    },

    async getRecipe(id: number): Promise<Recipe | null> {
      const rs = await client.execute({
        sql: `${RECIPE_SELECT} WHERE r.id = ?`,
        args: [id],
      });
      return rs.rows[0] ? rowToRecipe(rs.rows[0]) : null;
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
      return (await this.getRecipe(Number(rs.lastInsertRowid))) as Recipe;
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
      return this.getRecipe(id);
    },

    async deleteRecipe(id: number): Promise<boolean> {
      const rs = await client.execute({
        sql: "DELETE FROM recipes WHERE id = ?",
        args: [id],
      });
      return rs.rowsAffected > 0;
    },
  };
}

export type Db = ReturnType<typeof createDb>;
