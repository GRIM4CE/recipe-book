import { describe, expect, it } from 'vitest';
import { filterRecipes } from '../src/filter.js';

const dinner = { id: 1, name: 'Dinner', color: '#E85D4C' };
const drinks = { id: 2, name: 'Drinks', color: '#4C9BE8' };

const recipes = [
  {
    id: 1,
    title: 'Sunday Bolognese',
    summary: 'Slow ragù.',
    ingredients: ['ground beef', 'tomatoes'],
    instructions: ['Simmer for hours.'],
    category: dinner,
    tags: ['Pasta', 'Slow Cooked'],
  },
  {
    id: 2,
    title: 'Negroni',
    summary: '',
    ingredients: ['gin', 'Campari', 'sweet vermouth'],
    instructions: ['Stir over ice.'],
    category: drinks,
    tags: ['Slow Cooked'],
  },
  {
    id: 3,
    title: 'Mystery Stew',
    summary: '',
    ingredients: [],
    instructions: [],
    category: null,
  },
];

describe('filterRecipes', () => {
  it('returns everything with no filters', () => {
    expect(filterRecipes(recipes)).toHaveLength(3);
  });

  it('matches title case-insensitively', () => {
    expect(filterRecipes(recipes, { query: 'negroni' })).toEqual([recipes[1]]);
  });

  it('matches ingredients and instructions', () => {
    expect(filterRecipes(recipes, { query: 'campari' })).toEqual([recipes[1]]);
    expect(filterRecipes(recipes, { query: 'simmer' })).toEqual([recipes[0]]);
  });

  it('filters by category, excluding uncategorized', () => {
    expect(filterRecipes(recipes, { categoryId: 1 })).toEqual([recipes[0]]);
  });

  it('combines category and query', () => {
    expect(filterRecipes(recipes, { categoryId: 2, query: 'gin' })).toEqual([
      recipes[1],
    ]);
    expect(filterRecipes(recipes, { categoryId: 1, query: 'gin' })).toEqual([]);
  });

  it('ignores surrounding whitespace in the query', () => {
    expect(filterRecipes(recipes, { query: '  stew  ' })).toEqual([recipes[2]]);
  });

  it('filters by tag, tolerating recipes without tags', () => {
    expect(filterRecipes(recipes, { tag: 'Pasta' })).toEqual([recipes[0]]);
    expect(filterRecipes(recipes, { tag: 'Slow Cooked' })).toEqual([
      recipes[0],
      recipes[1],
    ]);
  });

  it('combines tag with category and query', () => {
    expect(filterRecipes(recipes, { tag: 'Slow Cooked', categoryId: 2 })).toEqual([
      recipes[1],
    ]);
    expect(filterRecipes(recipes, { tag: 'Pasta', query: 'gin' })).toEqual([]);
  });

  it('filters by ingredient, matching within freeform lines', () => {
    expect(filterRecipes(recipes, { ingredient: 'campari' })).toEqual([recipes[1]]);
    expect(filterRecipes(recipes, { ingredient: 'beef' })).toEqual([recipes[0]]);
    // Case-insensitive and tolerant of recipes with no ingredients.
    expect(filterRecipes(recipes, { ingredient: 'GIN' })).toEqual([recipes[1]]);
    expect(filterRecipes(recipes, { ingredient: 'saffron' })).toEqual([]);
  });

  it('combines ingredient with other filters', () => {
    expect(filterRecipes(recipes, { ingredient: 'tomatoes', categoryId: 1 })).toEqual([
      recipes[0],
    ]);
    expect(filterRecipes(recipes, { ingredient: 'gin', tag: 'Pasta' })).toEqual([]);
  });
});

describe('fuzzy and synonym search', () => {
  const items = [
    {
      id: 1,
      title: 'Whiskey Sour',
      summary: '',
      ingredients: ['2 oz bourbon', '3/4 oz lemon juice'],
      instructions: ['Shake with ice.'],
      category: null,
    },
    {
      id: 2,
      title: 'Classic Negroni',
      summary: '',
      ingredients: ['1 oz gin', '1 oz Campari'],
      instructions: ['Stir over ice.'],
      category: null,
    },
    {
      id: 3,
      title: 'Sunday Bolognese',
      summary: 'Slow ragu.',
      ingredients: ['1 lb ground beef'],
      instructions: ['Simmer for hours.'],
      category: null,
    },
  ];
  const ids = (opts) => filterRecipes(items, opts).map((r) => r.id);

  it('tolerates spelling variants: whisky finds Whiskey Sour', () => {
    expect(ids({ query: 'whisky' })).toEqual([1]);
  });

  it('tolerates single-typo misspellings', () => {
    expect(ids({ query: 'negoni' })).toEqual([2]); // dropped an r
    expect(ids({ query: 'bolonese' })).toEqual([3]); // dropped a g
  });

  it('matches synonyms: whisky finds a recipe that only says bourbon', () => {
    const onlyBourbon = [
      { ...items[0], title: 'Old Fashioned', ingredients: ['2 oz bourbon', 'bitters'] },
    ];
    expect(filterRecipes(onlyBourbon, { query: 'whisky' })).toHaveLength(1);
  });

  it('keeps short words exact so noise stays out', () => {
    // "rice" (4 chars) must not fuzzily pull in "ice" / unrelated recipes.
    expect(ids({ query: 'rice' })).toEqual([]);
  });

  it('requires every query word to match (AND)', () => {
    expect(ids({ query: 'sour whiskey' })).toEqual([1]);
    expect(ids({ query: 'sour gin' })).toEqual([]);
  });

  it('does not match unrelated recipes on a fuzzy query', () => {
    expect(ids({ query: 'whisky' })).not.toContain(2);
    expect(ids({ query: 'whisky' })).not.toContain(3);
  });
});
