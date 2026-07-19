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
  },
  {
    id: 2,
    title: 'Negroni',
    summary: '',
    ingredients: ['gin', 'Campari', 'sweet vermouth'],
    instructions: ['Stir over ice.'],
    category: drinks,
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
});
