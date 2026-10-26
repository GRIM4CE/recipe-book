import { describe, expect, it } from "vitest";
import { buildPrompt } from "../src/translate.js";

const recipe = {
  title: "Crêpes",
  summary: "",
  servings: "4",
  ingredients: ["2 c. à soupe de sucre", "1 tasse de farine"],
  instructions: ["Mélanger.", "Cuire."],
  notes: "Source: https://example.com/crepes",
};

describe("buildPrompt", () => {
  const prompt = buildPrompt({ from: "fr", to: "en", recipe });

  it("names both languages in full", () => {
    expect(prompt).toContain("from French to English");
    expect(buildPrompt({ from: "en", to: "fr", recipe })).toContain(
      "from English to French",
    );
  });

  it("keeps the lists aligned entry for entry", () => {
    expect(prompt).toMatch(/same number of entries in the same order/);
  });

  it("converts to metric when translating into French", () => {
    const fr = buildPrompt({ from: "en", to: "fr", recipe });
    expect(fr).toContain("to metric");
    expect(fr).toContain("grams");
    expect(fr).toContain("millilitres");
    expect(fr).toContain("Celsius");
    expect(fr).toContain("350 °F → 180 °C");
  });

  it("keeps quantities as written when translating into English", () => {
    expect(prompt).toContain("keep quantities and units as written");
    expect(prompt).not.toContain("Celsius");
  });

  it("leaves URLs, proper nouns and brands alone, and empties empty", () => {
    expect(prompt).toContain("leave URLs, proper nouns and brand names untouched");
    expect(prompt).toContain("an empty string stays empty");
  });

  it("ends with the recipe as JSON", () => {
    expect(prompt.endsWith(JSON.stringify(recipe))).toBe(true);
  });
});
