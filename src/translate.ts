import Anthropic from "@anthropic-ai/sdk";
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

type TranslateInput = Parameters<Translator["translate"]>[0];

const LANGUAGE_NAMES: Record<Language, string> = { en: "English", fr: "French" };

const RESULT_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    servings: { type: "string" },
    ingredients: { type: "array", items: { type: "string" } },
    instructions: { type: "array", items: { type: "string" } },
    notes: { type: "string" },
  },
  required: ["title", "summary", "servings", "ingredients", "instructions", "notes"],
  additionalProperties: false,
};

export function buildPrompt(input: TranslateInput): string {
  const from = LANGUAGE_NAMES[input.from];
  const to = LANGUAGE_NAMES[input.to];
  return [
    `Translate this recipe from ${from} to ${to} for a recipe app.`,
    "Rules:",
    `- translate every field from ${from} to ${to}.`,
    "- ingredients and instructions: keep the same number of entries in the same order, translating one entry per entry.",
    "- keep quantities and numbers as written, but convert unit names to the usual abbreviations of the target language (tbsp ↔ c. à soupe, tsp ↔ c. à café, cup ↔ tasse).",
    "- leave URLs, proper nouns and brand names untouched.",
    "- an empty string stays empty.",
    "- return only the JSON.",
    "",
    JSON.stringify(input.recipe),
  ].join("\n");
}

export function createClaudeTranslator(opts: { apiKey: string }): Translator {
  const client = new Anthropic({ apiKey: opts.apiKey });
  return {
    async translate(input) {
      const response = await client.messages.create({
        model: "claude-haiku-5-5",
        max_tokens: 8000,
        output_config: {
          format: { type: "json_schema" as const, schema: RESULT_SCHEMA },
        },
        messages: [{ role: "user", content: buildPrompt(input) }],
      });
      // No server tools here, so the first text block is the JSON answer.
      const text = response.content.find(
        (b): b is Anthropic.TextBlock => b.type === "text",
      );
      if (!text) {
        throw new Error(
          `no text block in response (stop_reason: ${response.stop_reason})`,
        );
      }
      return JSON.parse(text.text) as TranslatableFields;
    },
  };
}
