import { describe, expect, it } from 'vitest';
import { STRINGS, detectLanguage, localizeRecipe, translate } from '../src/i18n.js';

describe('detectLanguage', () => {
  it('prefers a valid stored choice over the browser language', () => {
    expect(detectLanguage('fr-CA', 'en')).toBe('en');
    expect(detectLanguage('en-US', 'fr')).toBe('fr');
  });

  it('falls back to French for French browsers, English otherwise', () => {
    expect(detectLanguage('fr-FR', null)).toBe('fr');
    expect(detectLanguage('FR', undefined)).toBe('fr');
    expect(detectLanguage('en-GB', null)).toBe('en');
    expect(detectLanguage('de-DE', null)).toBe('en');
  });

  it('ignores an invalid stored value and a missing browser language', () => {
    expect(detectLanguage('fr-FR', 'es')).toBe('fr');
    expect(detectLanguage(undefined, 'xx')).toBe('en');
  });
});

describe('STRINGS', () => {
  const placeholders = (text) => (text.match(/\{\w+\}/g) ?? []).sort();

  it('has the same keys in both languages', () => {
    expect(Object.keys(STRINGS.fr).sort()).toEqual(Object.keys(STRINGS.en).sort());
  });

  it('has no empty strings', () => {
    for (const lang of Object.keys(STRINGS)) {
      for (const [key, value] of Object.entries(STRINGS[lang])) {
        expect(value.trim(), `${lang}.${key}`).not.toBe('');
      }
    }
  });

  it('uses the same {placeholders} in both languages', () => {
    for (const key of Object.keys(STRINGS.en)) {
      expect(placeholders(STRINGS.fr[key]), key).toEqual(placeholders(STRINGS.en[key]));
    }
  });
});

describe('translate', () => {
  it('looks the key up in the chosen language', () => {
    expect(translate(STRINGS, 'en', 'back')).toBe('Back');
    expect(translate(STRINGS, 'fr', 'back')).toBe('Retour');
  });

  it('interpolates {vars}', () => {
    expect(translate(STRINGS, 'en', 'importFound', { n: 3 })).toBe('Found 3 recipes — pick one');
    expect(translate(STRINGS, 'fr', 'showing', { shown: 50, total: 80 })).toContain('50 sur 80');
  });

  it('leaves a placeholder alone when no value is given', () => {
    expect(translate(STRINGS, 'en', 'importFound')).toContain('{n}');
  });

  it('falls back to English, then to the key', () => {
    const strings = { en: { only: 'English only' }, fr: {} };
    expect(translate(strings, 'fr', 'only')).toBe('English only');
    expect(translate(strings, 'fr', 'missing')).toBe('missing');
  });
});

describe('localizeRecipe', () => {
  const french = {
    id: 1,
    language: 'fr',
    source: 'web',
    title: 'Gratin dauphinois',
    summary: 'Crémeux.',
    servings: '4',
    ingredients: ['pommes de terre'],
    instructions: ['Cuire.'],
    notes: 'Servir chaud.',
    translations: {
      en: {
        title: 'Potato gratin',
        summary: 'Creamy.',
        servings: '4',
        ingredients: ['potatoes'],
        instructions: ['Bake.'],
        notes: 'Serve hot.',
        stale: false,
      },
    },
  };

  it('shows the source fields in the recipe’s own language', () => {
    const r = localizeRecipe(french, 'fr');
    expect(r.title).toBe('Gratin dauphinois');
    expect(r.translation).toEqual({ shown: 'source', stale: false, pending: false });
  });

  it('shows the translation in another language', () => {
    const r = localizeRecipe(french, 'en');
    expect(r.title).toBe('Potato gratin');
    expect(r.summary).toBe('Creamy.');
    expect(r.ingredients).toEqual(['potatoes']);
    expect(r.instructions).toEqual(['Bake.']);
    expect(r.notes).toBe('Serve hot.');
    expect(r.translation).toEqual({ shown: 'translated', stale: false, pending: false });
  });

  it('keeps the other recipe fields, including source', () => {
    const r = localizeRecipe(french, 'en');
    expect(r.id).toBe(1);
    expect(r.source).toBe('web');
  });

  it('flags a stale translation', () => {
    const stale = {
      ...french,
      translations: { en: { ...french.translations.en, stale: true } },
    };
    const r = localizeRecipe(stale, 'en');
    expect(r.title).toBe('Potato gratin');
    expect(r.translation).toEqual({ shown: 'translated', stale: true, pending: false });
  });

  it('shows the source and marks it pending when there is no translation', () => {
    const bare = { ...french, translations: {} };
    const r = localizeRecipe(bare, 'en');
    expect(r.title).toBe('Gratin dauphinois');
    expect(r.translation).toEqual({ shown: 'source', stale: false, pending: true });
    expect(localizeRecipe({ ...french, translations: undefined }, 'en').translation.pending).toBe(
      true,
    );
  });

  it('keeps the untouched recipe under original', () => {
    const snapshot = structuredClone(french);
    const r = localizeRecipe(french, 'en');
    expect(r.original).toBe(french);
    expect(r.original.title).toBe('Gratin dauphinois');
    expect(french).toEqual(snapshot);
  });
});
