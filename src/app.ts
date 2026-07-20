import { mkdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import { requireUser, type TokenVerifier } from "./auth.js";
import { createExternalRouter } from "./external.js";
import type { Db } from "./db.js";
import type { ExtractionResult, Extractor } from "./extract.js";
import type { Recipe, RecipeInput } from "./types.js";
import type { Presigner } from "./uploads.js";

export interface AppOptions {
  db: Db;
  verifier?: TokenVerifier | null;
  isProduction?: boolean;
  // Extra allowed CORS origin (the deployed web app). localhost:5173 is
  // always allowed for dev.
  webOrigin?: string;
  // Prefix for photo URLs: the S3 bucket URL in prod, "" locally (the dev
  // server serves /photos/* from disk).
  photoBaseUrl?: string;
  // Issues photo upload URLs. Absent → uploads are disabled (503).
  presigner?: Presigner | null;
  // Local dev only: directory that backs the disk photo store. Enables the
  // PUT/GET routes the local presigner points at.
  localPhotoDir?: string | null;
  // Bearer secret for the /api/external importer surface. Empty → 503s.
  externalSecret?: string;
  // Turns pasted text or a recipe photo into structured fields. Absent →
  // extraction is disabled (503).
  extractor?: Extractor | null;
}

function cors(webOrigin: string): RequestHandler {
  const allowed = new Set(["http://localhost:5173", webOrigin].filter(Boolean));
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowed.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    }
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  };
}

function parseRecipeInput(body: unknown): RecipeInput | string {
  if (typeof body !== "object" || body === null) return "body must be an object";
  const b = body as Record<string, unknown>;
  if (typeof b.title !== "string" || !b.title.trim()) return "title is required";
  for (const key of ["ingredients", "instructions"] as const) {
    const v = b[key] ?? [];
    if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) {
      return `${key} must be an array of strings`;
    }
  }
  if (b.summary !== undefined && typeof b.summary !== "string") {
    return "summary must be a string";
  }
  if (
    b.categoryId !== undefined &&
    b.categoryId !== null &&
    typeof b.categoryId !== "number"
  ) {
    return "categoryId must be a number or null";
  }
  if (
    b.photoKey !== undefined &&
    b.photoKey !== null &&
    typeof b.photoKey !== "string"
  ) {
    return "photoKey must be a string or null";
  }
  return {
    title: b.title.trim(),
    summary: (b.summary as string | undefined)?.trim() ?? "",
    ingredients: ((b.ingredients as string[] | undefined) ?? []).filter((s) =>
      s.trim(),
    ),
    instructions: ((b.instructions as string[] | undefined) ?? []).filter((s) =>
      s.trim(),
    ),
    categoryId: (b.categoryId as number | null | undefined) ?? null,
    photoKey: (b.photoKey as string | null | undefined) ?? null,
  };
}

function parseCategoryInput(
  body: unknown,
): { name: string; color: string } | string {
  if (typeof body !== "object" || body === null) return "body must be an object";
  const b = body as Record<string, unknown>;
  if (typeof b.name !== "string" || !b.name.trim()) return "name is required";
  if (typeof b.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(b.color)) {
    return "color must be a #rrggbb hex string";
  }
  return { name: b.name.trim(), color: b.color };
}

function parseExtractInput(
  body: unknown,
): { text: string } | { image: string } | { url: string } | string {
  if (typeof body !== "object" || body === null) return "body must be an object";
  const b = body as Record<string, unknown>;
  const given = ["text", "image", "url"].filter((k) => b[k] !== undefined);
  if (given.length !== 1) return "provide exactly one of text, image, or url";
  if (b.text !== undefined) {
    if (typeof b.text !== "string" || !b.text.trim()) {
      return "text must be a non-empty string";
    }
    return { text: b.text };
  }
  if (b.url !== undefined) {
    if (typeof b.url !== "string") return "url must be a string";
    let parsed: URL;
    try {
      parsed = new URL(b.url);
    } catch {
      return "url must be an absolute http(s) URL";
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "url must be an absolute http(s) URL";
    }
    return { url: b.url };
  }
  if (typeof b.image !== "string" || !b.image) {
    return "image must be a base64 string";
  }
  if (b.mediaType !== "image/jpeg") return "mediaType must be image/jpeg";
  return { image: b.image };
}

export function createApp(opts: AppOptions) {
  const { db } = opts;
  const app = express();
  app.use(cors(opts.webOrigin ?? ""));

  const writeAuth = requireUser({
    verifier: opts.verifier ?? null,
    isProduction: opts.isProduction ?? false,
  });

  // Registered before the global 1mb parser: the body carries a base64
  // image, so this route parses its own body with a larger cap.
  app.post(
    "/api/extract",
    express.json({ limit: "10mb" }),
    writeAuth,
    async (req, res) => {
      if (!opts.extractor) {
        res.status(503).json({ error: "recipe extraction is not configured" });
        return;
      }
      const input = parseExtractInput(req.body);
      if (typeof input === "string") {
        res.status(400).json({ error: input });
        return;
      }
      const categories = await db.listCategories();
      let result: ExtractionResult;
      try {
        result = await opts.extractor.extract({
          ...input,
          categoryNames: categories.map((c) => c.name),
        });
      } catch (err) {
        console.error("extraction failed:", err);
        res.status(502).json({ error: "extraction failed" });
        return;
      }
      if (result.pageUnreadable) {
        res.status(422).json({
          error: "couldn't read that page — copy the recipe text instead",
        });
        return;
      }
      if (result.recipes.length === 0) {
        res.status(422).json({ error: "no recipe found in that input" });
        return;
      }
      const recipes = [];
      for (const r of result.recipes) {
        const category = r.category
          ? await db.getCategoryByName(r.category)
          : null;
        recipes.push({
          title: r.title,
          summary: r.summary,
          ingredients: r.ingredients,
          instructions: r.instructions,
          categoryId: category?.id ?? null,
        });
      }
      res.json({ recipes });
    },
  );

  app.use(express.json({ limit: "1mb" }));

  const photoBaseUrl = opts.photoBaseUrl ?? "";
  const serialize = (r: Recipe) => ({
    ...r,
    photoUrl: r.photoKey ? `${photoBaseUrl}/${r.photoKey}` : null,
  });

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/recipes", async (_req, res) => {
    res.json({ recipes: (await db.listRecipes()).map(serialize) });
  });

  app.get("/api/recipes/:id", async (req, res) => {
    const recipe = await db.getRecipe(Number(req.params.id));
    if (!recipe) {
      res.status(404).json({ error: "recipe not found" });
      return;
    }
    res.json(serialize(recipe));
  });

  app.post("/api/recipes", writeAuth, async (req, res) => {
    const input = parseRecipeInput(req.body);
    if (typeof input === "string") {
      res.status(400).json({ error: input });
      return;
    }
    if (input.categoryId != null && !(await db.getCategory(input.categoryId))) {
      res.status(400).json({ error: "unknown category" });
      return;
    }
    const recipe = await db.createRecipe(input, {
      createdBy: String(res.locals.username),
      source: "web",
    });
    res.status(201).json(serialize(recipe));
  });

  app.put("/api/recipes/:id", writeAuth, async (req, res) => {
    const input = parseRecipeInput(req.body);
    if (typeof input === "string") {
      res.status(400).json({ error: input });
      return;
    }
    if (input.categoryId != null && !(await db.getCategory(input.categoryId))) {
      res.status(400).json({ error: "unknown category" });
      return;
    }
    const recipe = await db.updateRecipe(Number(req.params.id), input);
    if (!recipe) {
      res.status(404).json({ error: "recipe not found" });
      return;
    }
    res.json(serialize(recipe));
  });

  app.delete("/api/recipes/:id", writeAuth, async (req, res) => {
    if (!(await db.deleteRecipe(Number(req.params.id)))) {
      res.status(404).json({ error: "recipe not found" });
      return;
    }
    res.status(204).end();
  });

  app.post("/api/uploads", writeAuth, async (_req, res) => {
    if (!opts.presigner) {
      res.status(503).json({ error: "photo uploads are not configured" });
      return;
    }
    res.json(await opts.presigner.presign());
  });

  if (opts.localPhotoDir) {
    const photoDir = join(opts.localPhotoDir, "photos");
    mkdirSync(photoDir, { recursive: true });
    const validName = /^[0-9a-f-]{36}\.jpg$/;

    app.put(
      "/api/uploads/photos/:name",
      express.raw({ type: "image/jpeg", limit: "10mb" }),
      async (req, res) => {
        if (!validName.test(req.params.name) || !Buffer.isBuffer(req.body)) {
          res.status(400).json({ error: "invalid upload" });
          return;
        }
        await writeFile(join(photoDir, req.params.name), req.body);
        res.status(201).json({ ok: true });
      },
    );

    app.get("/photos/:name", async (req, res) => {
      if (!validName.test(req.params.name)) {
        res.status(400).json({ error: "invalid photo name" });
        return;
      }
      try {
        const data = await readFile(join(photoDir, req.params.name));
        res.setHeader("Content-Type", "image/jpeg").send(data);
      } catch {
        res.status(404).json({ error: "photo not found" });
      }
    });
  }

  app.get("/api/categories", async (_req, res) => {
    res.json({ categories: await db.listCategories() });
  });

  app.post("/api/categories", writeAuth, async (req, res) => {
    const input = parseCategoryInput(req.body);
    if (typeof input === "string") {
      res.status(400).json({ error: input });
      return;
    }
    if (await db.getCategoryByName(input.name)) {
      res.status(409).json({ error: "category already exists" });
      return;
    }
    res.status(201).json(await db.createCategory(input));
  });

  app.put("/api/categories/:id", writeAuth, async (req, res) => {
    const input = parseCategoryInput(req.body);
    if (typeof input === "string") {
      res.status(400).json({ error: input });
      return;
    }
    const existing = await db.getCategoryByName(input.name);
    if (existing && existing.id !== Number(req.params.id)) {
      res.status(409).json({ error: "category already exists" });
      return;
    }
    const category = await db.updateCategory(Number(req.params.id), input);
    if (!category) {
      res.status(404).json({ error: "category not found" });
      return;
    }
    res.json(category);
  });

  app.delete("/api/categories/:id", writeAuth, async (req, res) => {
    const result = await db.deleteCategory(Number(req.params.id));
    if (result === "in_use") {
      res.status(409).json({ error: "category is still used by recipes" });
      return;
    }
    if (result === "missing") {
      res.status(404).json({ error: "category not found" });
      return;
    }
    res.status(204).end();
  });

  app.use(
    "/api/external",
    createExternalRouter({
      db,
      secret: opts.externalSecret ?? "",
      presigner: opts.presigner ?? null,
      serialize,
    }),
  );

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  };
  app.use(onError);

  return app;
}
