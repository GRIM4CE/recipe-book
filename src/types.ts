export interface Category {
  id: number;
  name: string;
  color: string;
  createdAt: string;
}

export type RecipeSource = "web" | "import";

export interface Recipe {
  id: number;
  title: string;
  summary: string;
  servings: string;
  ingredients: string[];
  instructions: string[];
  notes: string;
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
  categoryId?: number | null;
  tags?: string[];
  photoKey?: string | null;
}
