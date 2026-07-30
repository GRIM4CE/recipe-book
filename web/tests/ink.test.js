import { describe, expect, it } from 'vitest';
import { inkFor } from '../src/ink.js';

const LIGHT = '#fff8ef';
const DARK = '#2a2622';

describe('inkFor', () => {
  it('goes dark on pale category colors', () => {
    expect(inkFor('#F2A93B')).toBe(DARK); // seed Breakfast orange
    expect(inkFor('#ffffff')).toBe(DARK);
  });

  it('goes light on deep category colors', () => {
    expect(inkFor('#E85D4C')).toBe(LIGHT); // seed Dinner red
    expect(inkFor('#000000')).toBe(LIGHT);
  });

  it('falls back to light ink for a missing or malformed color', () => {
    expect(inkFor(undefined)).toBe(LIGHT);
    expect(inkFor('rebeccapurple')).toBe(LIGHT);
  });
});
