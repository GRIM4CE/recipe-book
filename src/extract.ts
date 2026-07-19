// Extraction seam: turns pasted text or a photographed recipe into structured
// fields. Injected into createApp like the presigner — tests use a stub, prod
// uses the Claude-backed implementation (added in the next task).
export interface ExtractInput {
  text?: string;
  // Base64 JPEG bytes (no data: prefix).
  image?: string;
  // Existing category names so the model picks one of ours or none.
  categoryNames: string[];
}

export interface ExtractedRecipe {
  // false when the input did not contain a recipe.
  found: boolean;
  title: string;
  summary: string;
  ingredients: string[];
  instructions: string[];
  // A category name from categoryNames, or null.
  category: string | null;
}

export interface Extractor {
  extract(input: ExtractInput): Promise<ExtractedRecipe>;
}
