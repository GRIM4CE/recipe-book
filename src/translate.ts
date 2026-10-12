import type { Language } from "./types.js";

// Translation seam: turns a recipe written in one language into the other.
// Injected into createApp like the extractor — tests use a stub, prod uses the
// Claude-backed implementation.
export interface TranslatableFields {
  title: string;
  summary: string;
  servings: string;
  ingredients: string[];
  instructions: string[];
  notes: string;
}

export interface Translator {
  translate(input: {
    from: Language;
    to: Language;
    recipe: TranslatableFields;
  }): Promise<TranslatableFields>;
}
