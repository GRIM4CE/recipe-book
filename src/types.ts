export interface Category {
  id: number;
  name: string;
  color: string;
  createdAt: string;
}

export interface TagSummary {
  id: number;
  name: string;
  count: number;
}

export type RecipeSource = "web" | "import";

export type Language = "en" | "fr";
export const LANGUAGES: readonly Language[] = ["en", "fr"];

export interface RecipeTranslation {
  title: string;
  summary: string;
  servings: string;
  ingredients: string[];
  instructions: string[];
  notes: string;
  // true when the source recipe was edited after this translation was made
  stale: boolean;
}

export interface Recipe {
  id: number;
  title: string;
  summary: string;
  servings: string;
  ingredients: string[];
  instructions: string[];
  notes: string;
  language: Language;
  translations: Partial<Record<Language, RecipeTranslation>>;
  category: Category | null;
  tags: string[];
  photoKey: string | null;
  createdBy: string;
  source: RecipeSource;
  createdAt: string;
  updatedAt: string;
}

export interface RecipeInput {
  title: string;
  summary?: string;
  servings?: string;
  ingredients?: string[];
  instructions?: string[];
  notes?: string;
  language?: Language;
  categoryId?: number | null;
  tags?: string[];
  photoKey?: string | null;
}
