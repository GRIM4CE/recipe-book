import Anthropic from "@anthropic-ai/sdk";

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
  // Servings/yield as written (e.g. "4" or "Makes 12"), "" if not stated.
  servings: string;
  ingredients: string[];
  instructions: string[];
  // A category name from categoryNames, or null.
  category: string | null;
}

export interface Extractor {
  extract(input: ExtractInput): Promise<ExtractedRecipe>;
}

// Strict response schema; found:false is the model's clean way of saying
// "this input isn't a recipe" instead of hallucinating fields.
const RECIPE_SCHEMA = {
  type: "object",
  properties: {
    found: {
      type: "boolean",
      description: "false when the input does not contain a recipe",
    },
    title: { type: "string" },
    summary: { type: "string", description: "one short line about the dish" },
    servings: {
      type: "string",
      description:
        'servings or yield as written (e.g. "4" or "Makes 12"), empty if not stated',
    },
    ingredients: { type: "array", items: { type: "string" } },
    instructions: { type: "array", items: { type: "string" } },
    category: {
      anyOf: [{ type: "string" }, { type: "null" }],
      description: "one of the provided category names, or null",
    },
  },
  required: [
    "found",
    "title",
    "summary",
    "servings",
    "ingredients",
    "instructions",
    "category",
  ],
  additionalProperties: false,
};

function buildPrompt(input: ExtractInput): string {
  const source = input.image
    ? "Read the recipe in the attached image (it may be handwritten, a cookbook page, or a screenshot)."
    : "Extract the recipe from the text below.";
  return [
    "Extract this recipe into structured data for a recipe app.",
    source,
    "Rules:",
    "- ingredients: one entry per ingredient, quantities as written.",
    "- instructions: one entry per step, without step numbers.",
    "- summary: one short line describing the dish.",
    '- servings: how many the recipe serves or yields, as written (e.g. "4" or "Makes 12"); empty if not stated.',
    `- category: the best fit among [${input.categoryNames.join(", ")}], or null if none fits.`,
    "- If the input does not contain a recipe, set found to false and leave every other field empty.",
    ...(input.text ? ["", input.text] : []),
  ].join("\n");
}

export function createClaudeExtractor(opts: { apiKey: string }): Extractor {
  const client = new Anthropic({ apiKey: opts.apiKey });
  return {
    async extract(input) {
      const content: Anthropic.ContentBlockParam[] = [];
      if (input.image) {
        content.push({
          type: "image",
          source: { type: "base64", media_type: "image/jpeg", data: input.image },
        });
      }
      content.push({ type: "text", text: buildPrompt(input) });
      const response = await client.messages.create({
        model: "claude-opus-4-8",
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        output_config: {
          format: { type: "json_schema", schema: RECIPE_SCHEMA },
        },
        messages: [{ role: "user", content }],
      });
      const text = response.content.find(
        (b): b is Anthropic.TextBlock => b.type === "text",
      );
      if (!text) {
        throw new Error(
          `no text block in response (stop_reason: ${response.stop_reason})`,
        );
      }
      return JSON.parse(text.text) as ExtractedRecipe;
    },
  };
}
