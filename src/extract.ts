import Anthropic from "@anthropic-ai/sdk";

// Extraction seam: turns pasted text or a photographed recipe into structured
// fields. Injected into createApp like the presigner — tests use a stub, prod
// uses the Claude-backed implementation (added in the next task).
export interface ExtractInput {
  text?: string;
  // Base64 JPEG bytes (no data: prefix).
  image?: string;
  // Absolute http(s) URL to fetch and extract from.
  url?: string;
  // Existing category names so the model picks one of ours or none.
  categoryNames: string[];
}

export interface ExtractedRecipe {
  title: string;
  summary: string;
  // Servings/yield as written (e.g. "4" or "Makes 12"); an estimate when not
  // stated, and "1" for cocktails unless a different yield is stated.
  servings: string;
  ingredients: string[];
  instructions: string[];
  // A category name from categoryNames, or null.
  category: string | null;
  // Who the recipe is credited to, as written on the source (e.g. "by Jane
  // Doe", "Adapted from NYT Cooking"), or null when no author is stated.
  credit: string | null;
}

export interface ExtractionResult {
  // True only when a url was given and its content could not be retrieved.
  pageUnreadable: boolean;
  // Every distinct recipe found; empty when the input had none.
  recipes: ExtractedRecipe[];
}

export interface Extractor {
  extract(input: ExtractInput): Promise<ExtractionResult>;
}

// Strict response schema. pageUnreadable distinguishes "couldn't fetch the
// page" from "page had no recipes" so the route can give copy-paste guidance.
const RESULT_SCHEMA = {
  type: "object",
  properties: {
    pageUnreadable: {
      type: "boolean",
      description:
        "true only when a URL was provided and its content could not be retrieved",
    },
    recipes: {
      type: "array",
      description: "every distinct recipe found; empty when there are none",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          summary: {
            type: "string",
            description: "one short line about the dish",
          },
          servings: {
            type: "string",
            description:
              'servings or yield as written (e.g. "4" or "Makes 12"); when not stated, an estimate from the ingredient quantities. For a cocktail, "1" unless a different yield is stated. Never empty.',
          },
          ingredients: { type: "array", items: { type: "string" } },
          instructions: { type: "array", items: { type: "string" } },
          category: {
            anyOf: [{ type: "string" }, { type: "null" }],
            description: "one of the provided category names, or null",
          },
          credit: {
            anyOf: [{ type: "string" }, { type: "null" }],
            description:
              "who the recipe is credited to, as written on the source (e.g. \"by Jane Doe\", \"Adapted from NYT Cooking\"); null when no author is stated",
          },
        },
        required: [
          "title",
          "summary",
          "servings",
          "ingredients",
          "instructions",
          "category",
          "credit",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["pageUnreadable", "recipes"],
  additionalProperties: false,
};

export function buildPrompt(input: ExtractInput): string {
  const source = input.image
    ? "Read the recipe in the attached image (it may be handwritten, a cookbook page, or a screenshot)."
    : input.url
      ? `Fetch this page and extract every distinct recipe on it: ${input.url}`
      : "Extract every distinct recipe from the text below.";
  return [
    "Extract recipes into structured data for a recipe app.",
    source,
    "Rules:",
    "- one entry per distinct recipe; variations of the same dish are one recipe.",
    "- ingredients: one entry per ingredient, quantities as written.",
    "- instructions: one entry per step, without step numbers.",
    "- summary: one short line describing the dish.",
    '- servings: how many the recipe serves or yields, as written (e.g. "4" or "Makes 12"). If not stated, estimate a reasonable number from the ingredient quantities and typical portion sizes. For cocktails and other single-drink recipes, use "1" unless a different yield is stated. Never leave this empty.',
    `- category: per recipe, the best fit among [${input.categoryNames.join(", ")}], or null if none fits.`,
    '- credit: who the recipe is credited to, as written on the source (e.g. "by Jane Doe", "Adapted from NYT Cooking"). Use null when no author or attribution is stated.',
    "- If the input contains no recipe, return an empty recipes array.",
    "- Set pageUnreadable to true only when a URL was provided and you could not retrieve its content; otherwise false.",
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

      const base = {
        model: "claude-opus-4-8",
        max_tokens: 16000,
        thinking: { type: "adaptive" as const },
        output_config: {
          format: { type: "json_schema" as const, schema: RESULT_SCHEMA },
        },
        ...(input.url
          ? {
              tools: [
                {
                  type: "web_fetch_20260209" as const,
                  name: "web_fetch" as const,
                  max_uses: 3,
                  allowed_domains: [new URL(input.url).hostname],
                },
              ],
            }
          : {}),
      };

      const messages: Anthropic.MessageParam[] = [{ role: "user", content }];
      let response = await client.messages.create({ ...base, messages });
      // Server-tool turns can pause mid-loop; append the assistant turn and
      // re-send to resume, bounded so a wedged loop becomes a 502.
      for (let i = 0; i < 5 && response.stop_reason === "pause_turn"; i++) {
        messages.push({ role: "assistant", content: response.content });
        response = await client.messages.create({ ...base, messages });
      }
      if (response.stop_reason === "pause_turn") {
        throw new Error("extraction did not finish (pause_turn limit)");
      }
      // With server tools the transcript interleaves tool blocks; the JSON
      // answer is the LAST text block.
      const text = [...response.content]
        .reverse()
        .find((b): b is Anthropic.TextBlock => b.type === "text");
      if (!text) {
        throw new Error(
          `no text block in response (stop_reason: ${response.stop_reason})`,
        );
      }
      return JSON.parse(text.text) as ExtractionResult;
    },
  };
}
