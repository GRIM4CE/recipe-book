import { timingSafeEqual } from "node:crypto";
import { Router, type RequestHandler } from "express";
import type { Db } from "./db.js";
import type { Recipe } from "./types.js";
import type { Presigner } from "./uploads.js";

// Import surface for the trusted automation that pushes recipes. A single
// long-lived bearer secret is the credential; every route 503s until the
// secret is configured so a half-configured deploy fails loudly, not openly.
export function createExternalRouter(opts: {
  db: Db;
  secret: string;
  presigner?: Presigner | null;
  serialize: (r: Recipe) => unknown;
}): Router {
  const requireSecret: RequestHandler = (req, res, next) => {
    if (!opts.secret) {
      res.status(503).json({ error: "external API is not configured" });
      return;
    }
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    const a = Buffer.from(token);
    const b = Buffer.from(opts.secret);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      res.status(401).json({ error: "invalid secret" });
      return;
    }
    next();
  };

  const router = Router();

  router.post("/recipes", requireSecret, async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (typeof b.title !== "string" || !b.title.trim()) {
      res.status(400).json({ error: "title is required" });
      return;
    }
    for (const key of ["ingredients", "instructions"] as const) {
      const v = b[key] ?? [];
      if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) {
        res.status(400).json({ error: `${key} must be an array of strings` });
        return;
      }
    }
    // Same unique-title rule the UI enforces: an importer that runs twice gets
    // told so rather than quietly making a second copy.
    if ((await opts.db.findRecipeIdByTitle(b.title.trim())) != null) {
      res.status(409).json({ error: "a recipe with that title already exists" });
      return;
    }
    // Category is matched by name or dropped — the importer must never
    // invent categories; those are managed in the UI.
    let categoryId: number | null = null;
    if (typeof b.category === "string" && b.category.trim()) {
      categoryId = (await opts.db.getCategoryByName(b.category.trim()))?.id ?? null;
    }
    const recipe = await opts.db.createRecipe(
      {
        title: b.title.trim(),
        summary: typeof b.summary === "string" ? b.summary.trim() : "",
        servings: typeof b.servings === "string" ? b.servings.trim() : "",
        ingredients: ((b.ingredients as string[] | undefined) ?? []).filter((s) =>
          s.trim(),
        ),
        instructions: ((b.instructions as string[] | undefined) ?? []).filter((s) =>
          s.trim(),
        ),
        categoryId,
        photoKey: typeof b.photoKey === "string" ? b.photoKey : null,
      },
      {
        createdBy:
          typeof b.createdBy === "string" && b.createdBy.trim()
            ? b.createdBy.trim()
            : "importer",
        source: "import",
      },
    );
    res.status(201).json(opts.serialize(recipe));
  });

  router.post("/uploads", requireSecret, async (_req, res) => {
    if (!opts.presigner) {
      res.status(503).json({ error: "photo uploads are not configured" });
      return;
    }
    res.json(await opts.presigner.presign());
  });

  return router;
}
