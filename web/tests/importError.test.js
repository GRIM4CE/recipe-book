import { describe, expect, it } from 'vitest';
import { STRINGS, translate } from '../src/i18n.js';
import { describeImportError } from '../src/importError.js';

const t = (key, vars) => translate(STRINGS, 'en', key, vars);

describe('describeImportError', () => {
  it('explains a request that never reached the server', () => {
    expect(describeImportError(new TypeError('Failed to fetch'), t)).toMatch(
      /reach the server/,
    );
    // Safari's wording
    expect(describeImportError(new Error('Load failed'), t)).toMatch(/reach the server/);
  });

  it('explains a bare status code from a server that died mid-request', () => {
    const text = describeImportError(new Error('502'), t);
    expect(text).toMatch(/error 502/);
    expect(text).toMatch(/paste the recipe text/);
  });

  it("passes the server's own reason through", () => {
    expect(describeImportError(new Error('no recipe found in that input'), t)).toBe(
      'no recipe found in that input',
    );
  });

  it('never shows an empty message', () => {
    expect(describeImportError(new Error(''), t)).toMatch(/unknown reason/);
    expect(describeImportError(undefined, t)).toMatch(/unknown reason/);
  });
});
