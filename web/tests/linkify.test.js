import { describe, expect, it } from 'vitest';
import { tokenizeLinks } from '../src/linkify.js';

const recipes = [
  { id: 1, title: 'Hobo Stew' },
  { id: 2, title: 'Hobo Stew Deluxe' },
  { id: 3, title: 'Dumplings' },
];

describe('tokenizeLinks', () => {
  it('returns nothing for empty text', () => {
    expect(tokenizeLinks('', recipes)).toEqual([]);
    expect(tokenizeLinks(null, recipes)).toEqual([]);
  });

  it('leaves plain text untouched when nothing matches', () => {
    expect(tokenizeLinks('Just mix it well.', recipes)).toEqual([
      { type: 'text', value: 'Just mix it well.' },
    ]);
  });

  it('links a referenced recipe by title', () => {
    const tokens = tokenizeLinks('Drop over Hobo Stew, covering top.', recipes);
    expect(tokens).toEqual([
      { type: 'text', value: 'Drop over ' },
      { type: 'recipe', id: 1, value: 'Hobo Stew' },
      { type: 'text', value: ', covering top.' },
    ]);
  });

  it('matches titles case-insensitively but keeps the original text', () => {
    const tokens = tokenizeLinks('serve with dumplings', recipes);
    expect(tokens).toEqual([
      { type: 'text', value: 'serve with ' },
      { type: 'recipe', id: 3, value: 'dumplings' },
    ]);
  });

  it('prefers the longest title when they overlap', () => {
    const tokens = tokenizeLinks('Try the Hobo Stew Deluxe tonight.', recipes);
    expect(tokens).toEqual([
      { type: 'text', value: 'Try the ' },
      { type: 'recipe', id: 2, value: 'Hobo Stew Deluxe' },
      { type: 'text', value: ' tonight.' },
    ]);
  });

  it('does not match a title inside a larger word', () => {
    const tokens = tokenizeLinks('Ask Stewart about it.', [{ id: 9, title: 'Stew' }]);
    expect(tokens).toEqual([{ type: 'text', value: 'Ask Stewart about it.' }]);
  });

  it('never links the recipe being viewed to itself', () => {
    const tokens = tokenizeLinks('This Hobo Stew is great.', recipes, 1);
    expect(tokens).toEqual([{ type: 'text', value: 'This Hobo Stew is great.' }]);
  });

  it('turns a URL into a link and strips trailing punctuation', () => {
    const tokens = tokenizeLinks('See https://example.com/recipe.', []);
    expect(tokens).toEqual([
      { type: 'text', value: 'See ' },
      { type: 'url', href: 'https://example.com/recipe', value: 'https://example.com/recipe' },
      { type: 'text', value: '.' },
    ]);
  });

  it('handles a URL and a recipe mention together', () => {
    const tokens = tokenizeLinks('Pair Dumplings with http://x.test here', recipes);
    expect(tokens).toEqual([
      { type: 'text', value: 'Pair ' },
      { type: 'recipe', id: 3, value: 'Dumplings' },
      { type: 'text', value: ' with ' },
      { type: 'url', href: 'http://x.test', value: 'http://x.test' },
      { type: 'text', value: ' here' },
    ]);
  });
});
