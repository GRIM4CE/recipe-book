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

// Bump whenever the prompt changes in a way that makes earlier translations
// wrong. Every stored translation is dropped on the next start (see
// applySchema) and regenerated on demand.
export const TRANSLATION_RULES_VERSION = 2;

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

// The household reads French recipes in metric, so translating into French
// converts measures; translating into English only translates the words.
const UNIT_RULES: Record<Language, string> = {
  fr: "- convert imperial and US customary measures to metric in the ingredients and instructions: cups, tablespoons and teaspoons to millilitres for liquids or grams for dry goods (1 cup flour ≈ 125 g, 1 cup sugar ≈ 200 g, 1 cup butter ≈ 225 g, 1 cup liquid ≈ 240 ml, 1 tbsp ≈ 15 ml, 1 tsp ≈ 5 ml; when the ingredient is unclear, use millilitres), ounces and pounds to grams (kilograms above 1000 g), fluid ounces to millilitres, inches to centimetres, and Fahrenheit to Celsius. Round to kitchen-sensible numbers (nearest 5 g, 5 ml or 5 °C, e.g. 350 °F → 180 °C). Write units the French way (g, kg, ml, l, cl where natural, °C, cm). Keep counts as they are (2 œufs). Keep small spoon measures as c. à soupe / c. à café only when converting to ml would read oddly (1 c. à café de sel is fine).",
  en: "- keep quantities and units as written (metric stays metric, do not convert to imperial); only translate the words, using the usual English abbreviations (c. à soupe → tbsp, c. à café → tsp, tasse → cup).",
};

export function buildPrompt(input: TranslateInput): string {
  const from = LANGUAGE_NAMES[input.from];
  const to = LANGUAGE_NAMES[input.to];
  return [
    `Translate this recipe from ${from} to ${to} for a recipe app.`,
    "Rules:",
    `- translate every field from ${from} to ${to}.`,
    "- ingredients and instructions: keep the same number of entries in the same order, translating one entry per entry.",
    UNIT_RULES[input.to],
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
