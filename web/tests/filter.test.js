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

describe('filterRecipes by person', () => {
  const made = [
    { id: 1, title: 'Soup', createdBy: 'jon', tags: ['Slow Cooked'] },
    { id: 2, title: 'Salad', createdBy: 'marie' },
    { id: 3, title: 'Stew', createdBy: 'jon' },
  ];

  it('keeps only recipes added by that person', () => {
    expect(filterRecipes(made, { createdBy: 'jon' }).map((r) => r.id)).toEqual([1, 3]);
    expect(filterRecipes(made, { createdBy: 'marie' }).map((r) => r.id)).toEqual([2]);
    expect(filterRecipes(made, { createdBy: 'nobody' })).toEqual([]);
  });

  it('shows everyone when unset', () => {
    expect(filterRecipes(made, { createdBy: null })).toHaveLength(3);
  });

  it('combines with the other filters', () => {
    expect(filterRecipes(made, { createdBy: 'jon', tag: 'Slow Cooked' }).map((r) => r.id)).toEqual([
      1,
    ]);
    expect(filterRecipes(made, { createdBy: 'marie', query: 'soup' })).toEqual([]);
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

describe('filterRecipes across languages', () => {
  const gratin = {
    id: 1,
    language: 'fr',
    title: 'Gratin dauphinois',
    summary: '',
    ingredients: ['pommes de terre', 'crème'],
    instructions: ['Cuire au four.'],
    translations: {
      en: {
        title: 'Potato gratin',
        summary: '',
        ingredients: ['potatoes', 'cream'],
        instructions: ['Bake in the oven.'],
      },
    },
  };

  it('finds a recipe through its translation', () => {
    expect(filterRecipes([gratin], { query: 'potatoes' })).toHaveLength(1);
    expect(filterRecipes([gratin], { query: 'pommes' })).toHaveLength(1);
  });

  it('still finds the source text when the list is shown translated', () => {
    const shown = { ...gratin, title: 'Potato gratin', original: gratin };
    expect(filterRecipes([shown], { query: 'dauphinois' })).toHaveLength(1);
  });

  it('does not match words found in no version', () => {
    expect(filterRecipes([gratin], { query: 'bourbon' })).toHaveLength(0);
  });
});

describe('accent-insensitive search', () => {
  const items = [
    {
      id: 1,
      title: 'Crème brûlée',
      summary: '',
      ingredients: ['500 ml crème fraîche', '4 œufs'],
      instructions: ['Caraméliser le sucre.'],
      category: null,
    },
    {
      id: 2,
      title: 'Pancakes',
      summary: '',
      ingredients: ['2 eggs', '1 cup flour'],
      instructions: ['Fry.'],
      category: null,
    },
  ];
  const ids = (opts) => filterRecipes(items, opts).map((r) => r.id);

  it('finds accented content with an accented query', () => {
    expect(ids({ query: 'crème' })).toEqual([1]);
    expect(ids({ query: 'brûlée' })).toEqual([1]);
  });

  it('finds accented content with an unaccented query', () => {
    expect(ids({ query: 'creme' })).toEqual([1]);
    expect(ids({ query: 'creme fraiche' })).toEqual([1]);
    expect(ids({ query: 'carameliser' })).toEqual([1]);
  });

  it('finds an accented query in unaccented content', () => {
    expect(ids({ query: 'crème brulee' })).toEqual([1]);
  });

  it('finds œufs with oeuf', () => {
    expect(ids({ query: 'oeuf' })).toEqual([1]);
    expect(ids({ query: 'œuf' })).toEqual([1]);
  });

  it('makes the ingredient filter accent-insensitive on both sides', () => {
    expect(ids({ ingredient: 'creme' })).toEqual([1]);
    expect(ids({ ingredient: 'Crème Fraîche' })).toEqual([1]);
    expect(ids({ ingredient: 'oeufs' })).toEqual([1]);
  });
});
