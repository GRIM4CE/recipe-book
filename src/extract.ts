import Anthropic, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  AuthenticationError,
  InternalServerError,
  PermissionDeniedError,
  RateLimitError,
} from "@anthropic-ai/sdk";
import type { Language } from "./types.js";

// Extraction seam: turns pasted text or a photographed recipe into structured
// fields. Injected into createApp like the presigner — tests use a stub, prod
// uses the Claude-backed implementation (added in the next task).
export interface ExtractInput {
  text?: string;
  // One or more base64 JPEG images (no data: prefix). Multiple images are read
  // together as one source — e.g. pages of the same recipe, or a batch to scan.
  images?: string[];
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
  // The language the recipe is written in; "en" when it is neither.
  language: Language;
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
          language: {
            type: "string",
            enum: ["en", "fr"],
            description:
              "the language the recipe is written in; en when it is neither",
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
          "language",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["pageUnreadable", "recipes"],
  additionalProperties: false,
};

export function buildPrompt(input: ExtractInput): string {
  const source = input.images?.length
    ? input.images.length > 1
      ? "Read the recipe(s) from the attached images (handwritten, cookbook pages, or screenshots). Multiple images may be pages of one recipe or several separate recipes."
      : "Read the recipe in the attached image (it may be handwritten, a cookbook page, or a screenshot)."
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
    '- language: the language the recipe is written in, "en" or "fr". Use "en" when it is neither.',
    "- If the input contains no recipe, return an empty recipes array.",
    "- Set pageUnreadable to true only when a URL was provided and you could not retrieve its content; otherwise false.",
    ...(input.text ? ["", input.text] : []),
  ].join("\n");
}

// Wall-clock budget for one extraction across every API round trip. Mobile
// Safari abandons a request at about 60 seconds, so the Lambda has to answer
// with a reason before then rather than be killed mid-call.
const EXTRACTION_BUDGET_MS = 50_000;

// A failure with a user-facing reason and the HTTP status the route should
// send. Anything else that escapes extract() is translated by
// describeExtractionError.
export class ExtractionFailure extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

// Maps whatever extract() threw to the status and sentence the route returns.
// The route still logs the raw error; this is what the person sees.
export function describeExtractionError(err: unknown): {
  status: number;
  message: string;
} {
  if (err instanceof ExtractionFailure) {
    return { status: err.status, message: err.message };
  }
  if (err instanceof APIConnectionTimeoutError) {
    return {
      status: 504,
      message: `Reading took longer than ${EXTRACTION_BUDGET_MS / 1000} seconds and was stopped. Try again, or copy the recipe text from the page and paste it instead.`,
    };
  }
  if (err instanceof APIConnectionError) {
    return {
      status: 502,
      message: "Couldn't reach the recipe reader. Try again in a moment.",
    };
  }
  if (err instanceof AuthenticationError || err instanceof PermissionDeniedError) {
    return {
      status: 502,
      message:
        "The recipe reader's API key was rejected. It needs to be replaced in the deploy settings.",
    };
  }
  if (err instanceof RateLimitError) {
    return {
      status: 503,
      message:
        "The recipe reader is rate-limited right now. Wait a minute and try again.",
    };
  }
  if (err instanceof InternalServerError) {
    return {
      status: 503,
      message:
        "The recipe reader is having trouble on its end. Wait a minute and try again.",
    };
  }
  if (err instanceof APIError) {
    // A 4xx the SDK doesn't name separately, e.g. a billing hold on a 400:
    // the API's own message is the most useful reason we have.
    const body = err.error as { error?: { message?: string } } | undefined;
    const reason = body?.error?.message ?? err.message;
    return {
      status: 502,
      message: `The recipe reader rejected the request: ${reason}`,
    };
  }
  if (err instanceof SyntaxError) {
    return {
      status: 502,
      message:
        "The recipe reader answered in a format we couldn't read. Try again.",
    };
  }
  return {
    status: 502,
    message:
      "Recipe reading failed unexpectedly. Try again, or copy the recipe text and paste it instead.",
  };
}

export function createClaudeExtractor(opts: { apiKey: string }): Extractor {
  // No SDK retries: a retried call can't fit in the budget, and a clear
  // "try again" beats a silent second attempt that overruns the browser.
  const client = new Anthropic({ apiKey: opts.apiKey, maxRetries: 0 });
  return {
    async extract(input) {
      const content: Anthropic.ContentBlockParam[] = [];
      for (const image of input.images ?? []) {
        content.push({
          type: "image",
          source: { type: "base64", media_type: "image/jpeg", data: image },
        });
      }
      content.push({ type: "text", text: buildPrompt(input) });

      const base = {
        model: "claude-haiku-5-5",
        max_tokens: 16000,
        thinking: { type: "adaptive" as const },
        output_config: {
          format: { type: "json_schema" as const, schema: RESULT_SCHEMA },
        },
        ...(input.url
          ? {
              tools: [
                {
                  type: "web_fetch_20260318" as const,
                  name: "web_fetch" as const,
                  max_uses: 3,
                  allowed_domains: [new URL(input.url).hostname],
                },
              ],
            }
          : {}),
      };

      const messages: Anthropic.MessageParam[] = [{ role: "user", content }];
      // Each round trip gets whatever is left of the budget; the SDK throws
      // APIConnectionTimeoutError when it runs out.
      const deadline = Date.now() + EXTRACTION_BUDGET_MS;
      const call = () =>
        client.messages.create(
          { ...base, messages },
          { timeout: Math.max(1, deadline - Date.now()) },
        );
      let response = await call();
      // Server-tool turns can pause mid-loop; append the assistant turn and
      // re-send to resume, bounded so a wedged loop becomes an error.
      for (let i = 0; i < 5 && response.stop_reason === "pause_turn"; i++) {
        messages.push({ role: "assistant", content: response.content });
        response = await call();
      }
      if (response.stop_reason === "pause_turn") {
        throw new ExtractionFailure(
          502,
          "Reading the page took too many steps and was stopped. Copy the recipe text from the page and paste it instead.",
        );
      }
      if (response.stop_reason === "refusal") {
        throw new ExtractionFailure(
          422,
          "The recipe reader declined to read this input.",
        );
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
