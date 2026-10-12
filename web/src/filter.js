// Pure search/filter over the full recipe list. The whole collection is
// household-scale, so filtering happens client-side for instant results.

// Words that should find each other in search. Deliberately small — culinary
// synonyms are endless — so this covers the common "same thing, different
// word" cases and grows as needed. Groups are bidirectional. Single words
// only, to line up with the token-based matcher below.
const SYNONYM_GROUPS = [
  ['whiskey', 'whisky', 'bourbon', 'rye', 'scotch'],
  ['cilantro', 'coriander'],
  ['eggplant', 'aubergine'],
  ['zucchini', 'courgette'],
  ['shrimp', 'prawn', 'prawns'],
  ['chickpea', 'chickpeas', 'garbanzo'],
  ['soda', 'cola', 'pop'],
];

const SYNONYMS = new Map();
for (const group of SYNONYM_GROUPS) {
  for (const word of group) SYNONYMS.set(word, group);
}

// Lowercase and strip accents so "Crème", "creme" and "CRÈME" all compare
// equal. NFD splits "è" into "e" + a combining mark, which we drop; ligatures
// like "œ" don't decompose, so they're spelled out.
const fold = (text) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae');

const tokenize = (text) => fold(text).match(/[\p{L}\p{N}]+/gu) ?? [];

// A query word matches a longer content word up to this edit distance. Short
// words stay exact so "rice" doesn't drag in "race"/"nice"; only longer words
// get more slack (so "bolonese" still finds "bolognese").
function fuzzThreshold(word) {
  if (word.length <= 4) return 0;
  if (word.length <= 7) return 1;
  return 2;
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const next = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + cost);
      diag = prev[j];
      prev[j] = next;
    }
  }
  return prev[b.length];
}

// A single query word matches a single content word if the query is contained
// in it (so "camp" finds "campari"), or — for typo tolerance — is within a
// small edit distance. Fuzz is opt-in: synonym-family words are matched
// exactly, because e.g. "whisk" (the verb) is one edit from "whisky" and would
// otherwise drag in every recipe that says "whisk the eggs".
function wordMatches(contentWord, queryWord, allowFuzz) {
  if (contentWord.includes(queryWord)) return true;
  if (!allowFuzz) return false;
  const threshold = fuzzThreshold(queryWord);
  return threshold > 0 && levenshtein(contentWord, queryWord) <= threshold;
}

// Every query word must match some content word. A word in the synonym map
// expands to its group (whisky → bourbon/rye/scotch/…) and matches those
// exactly; a word not in the map gets typo tolerance instead.
function matchesQuery(contentWords, queryWords) {
  return queryWords.every((queryWord) => {
    const group = SYNONYMS.get(queryWord);
    const variants = group ?? [queryWord];
    const allowFuzz = !group;
    return contentWords.some((contentWord) =>
      variants.some((variant) => wordMatches(contentWord, variant, allowFuzz)),
    );
  });
}

export function filterRecipes(
  recipes,
  { query = '', categoryId = null, tag = null, ingredient = '' } = {},
) {
  const queryWords = tokenize(query);
  const ing = fold(ingredient.trim());
  return recipes.filter((r) => {
    if (categoryId != null && r.category?.id !== categoryId) return false;
    if (tag != null && !(r.tags ?? []).includes(tag)) return false;
    if (ing && !(r.ingredients ?? []).some((line) => fold(line).includes(ing)))
      return false;
    if (queryWords.length === 0) return true;
    // Every language version counts, so an English search finds a French
    // recipe through its English translation and vice versa. `original` is the
    // source text when the list has been localized (see localizeRecipe).
    const versions = [r, r.original, ...Object.values(r.translations ?? {})].filter(Boolean);
    const contentWords = tokenize(
      versions
        .flatMap((v) => [v.title, v.summary, ...(v.ingredients ?? []), ...(v.instructions ?? [])])
        .join(' '),
    );
    return matchesQuery(contentWords, queryWords);
  });
}
