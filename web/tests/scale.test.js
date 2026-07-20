import { describe, expect, it } from 'vitest';
import { scaleIngredient, scaleServings } from '../src/scale.js';

describe('scaleIngredient', () => {
  it('returns the line untouched at 1×', () => {
    expect(scaleIngredient('10 tbsp butter', 1)).toBe('10 tbsp butter');
  });

  it('leaves lines with no leading quantity alone', () => {
    expect(scaleIngredient('Berries and nuts to top', 2)).toBe(
      'Berries and nuts to top',
    );
  });

  it('scales plain counts and simple fractions', () => {
    expect(scaleIngredient('2 eggs', 2)).toBe('4 eggs');
    expect(scaleIngredient('3 cloves garlic, minced', 2)).toBe(
      '6 cloves garlic, minced',
    );
    expect(scaleIngredient('1/2 cup honey', 2)).toBe('1 cup honey');
    expect(scaleIngredient('1/2 tsp salt', 0.5)).toBe('1/4 tsp salt');
  });

  it('scales mixed numbers and unicode fractions', () => {
    expect(scaleIngredient('2 1/4 cups flour', 2)).toBe('4 1/2 cups flour');
    expect(scaleIngredient('½ cup rolled oats', 4)).toBe('2 cups rolled oats');
  });

  it('converts tablespoons up to cups instead of piling them up', () => {
    expect(scaleIngredient('4 tbsp butter', 2)).toBe('1/2 cup butter');
    expect(scaleIngredient('2 tbsp apple cider vinegar', 4)).toBe(
      '1/2 cup apple cider vinegar',
    );
    expect(scaleIngredient('1 tbsp chia seeds', 4)).toBe('1/4 cup chia seeds');
  });

  it('converts down to teaspoons instead of fractional tablespoons', () => {
    expect(scaleIngredient('1 tbsp soy sauce', 0.25)).toBe('3/4 tsp soy sauce');
    expect(scaleIngredient('2 tbsp sugar', 0.125)).toBe('3/4 tsp sugar');
    expect(scaleIngredient('1 tbsp grated ginger', 0.5)).toBe(
      '1 1/2 tsp grated ginger',
    );
  });

  it('splits awkward volumes into measurable parts', () => {
    expect(scaleIngredient('5 tbsp milk', 2)).toBe('1/2 cup + 2 tbsp milk');
    expect(scaleIngredient('1/3 cup broth', 0.5)).toBe('2 tbsp + 2 tsp broth');
    expect(scaleIngredient('3/4 cup cream', 0.5)).toBe('1/4 cup + 2 tbsp cream');
  });

  it('keeps clean cup fractions as cups', () => {
    expect(scaleIngredient('2 cups flour', 0.125)).toBe('1/4 cup flour');
    expect(scaleIngredient('1 cup yogurt', 2)).toBe('2 cups yogurt');
    expect(scaleIngredient('2 cups buttermilk', 0.5)).toBe('1 cup buttermilk');
  });

  it('understands T, t, and c abbreviations', () => {
    expect(scaleIngredient('4 T butter', 2)).toBe('1/2 cup butter');
    expect(scaleIngredient('1 t vanilla', 2)).toBe('2 tsp vanilla');
    expect(scaleIngredient('1 c. flour', 2)).toBe('2 cups flour');
  });

  it('scales ranges numerically, keeping the wording', () => {
    expect(
      scaleIngredient('3–4 habaneros, minced (seeds removed for less heat)', 2),
    ).toBe('6–8 habaneros, minced (seeds removed for less heat)');
    expect(scaleIngredient('3–4 habaneros, minced', 0.25)).toBe(
      '3/4–1 habaneros, minced',
    );
  });

  it('scales non-volume units without converting them', () => {
    expect(scaleIngredient('28 oz crushed tomatoes', 0.25)).toBe(
      '7 oz crushed tomatoes',
    );
    expect(scaleIngredient('1.5 lb chicken thighs', 2)).toBe(
      '3 lb chicken thighs',
    );
    expect(scaleIngredient('3/4 oz lemon juice', 2)).toBe('1 1/2 oz lemon juice');
  });

  it('rounds large awkward amounts to whole numbers', () => {
    expect(scaleIngredient('250 g flour', 0.25)).toBe('63 g flour');
  });

  it('never invents unmeasurable fractions', () => {
    expect(scaleIngredient('1/2 tsp salt', 0.125)).toBe('1/16 tsp salt');
    // 1/4 tsp ÷ 8 = 1/32 tsp: snapped to the nearest sixteenth.
    expect(scaleIngredient('1/4 tsp nutmeg', 0.125)).toBe('1/16 tsp nutmeg');
  });
});

describe('scaleServings', () => {
  it('passes empty text and 1× through', () => {
    expect(scaleServings('', 2)).toBe('');
    expect(scaleServings('4', 1)).toBe('4');
  });

  it('scales a bare number', () => {
    expect(scaleServings('4', 2)).toBe('8');
    expect(scaleServings('4', 0.25)).toBe('1');
  });

  it('scales the number inside surrounding text', () => {
    expect(scaleServings('Makes 24 cookies', 0.5)).toBe('Makes 12 cookies');
  });

  it('scales ranges', () => {
    expect(scaleServings('Serves 4–6', 2)).toBe('Serves 8–12');
    expect(scaleServings('Serves 4–6', 0.5)).toBe('Serves 2–3');
  });
});
