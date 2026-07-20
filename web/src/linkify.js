// Turn free-text recipe prose into linkable tokens. Two kinds of links:
// external URLs (opened in a new tab by the renderer) and mentions of other
// recipes by title (a jump to that recipe's card). Pure and framework-free so
// it's unit-testable; the React side just maps tokens to elements.

// Grab http/https URLs but drop trailing sentence punctuation so "see http://x."
// links "http://x", not "http://x.".
const URL_RE = /\bhttps?:\/\/[^\s<]+[^\s<.,:;!?)\]}'"]/gi;

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// One regex matching any of the given titles as a whole phrase, longest first
// so "Hobo Stew Deluxe" wins over "Hobo Stew". The lookarounds are alphanumeric
// boundaries that also work for multi-word titles, so "Stew" won't match inside
// "Stewart".
function titlePattern(titles) {
  const alts = [...titles]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join('|');
  return new RegExp(`(?<![A-Za-z0-9])(${alts})(?![A-Za-z0-9])`, 'gi');
}

// Returns an array of tokens: { type: 'text', value } | { type: 'url', href,
// value } | { type: 'recipe', id, value }. `excludeId` skips the recipe being
// viewed so it never links to itself.
export function tokenizeLinks(text, recipes = [], excludeId = null) {
  if (!text) return [];

  const targets = recipes.filter((r) => r.id !== excludeId && r.title?.trim());
  const byLowerTitle = new Map(targets.map((r) => [r.title.toLowerCase(), r]));
  const titleRe = targets.length ? titlePattern(targets.map((r) => r.title)) : null;

  const tokens = [];

  // Recipe titles are matched only in the gaps between URLs, so a URL that
  // happens to contain a title isn't torn apart.
  const pushText = (chunk) => {
    if (!chunk) return;
    if (!titleRe) {
      tokens.push({ type: 'text', value: chunk });
      return;
    }
    titleRe.lastIndex = 0;
    let at = 0;
    let tm;
    while ((tm = titleRe.exec(chunk))) {
      if (tm.index > at) tokens.push({ type: 'text', value: chunk.slice(at, tm.index) });
      const recipe = byLowerTitle.get(tm[1].toLowerCase());
      tokens.push({ type: 'recipe', id: recipe.id, value: tm[1] });
      at = tm.index + tm[1].length;
    }
    if (at < chunk.length) tokens.push({ type: 'text', value: chunk.slice(at) });
  };

  let last = 0;
  let m;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(text))) {
    if (m.index > last) pushText(text.slice(last, m.index));
    tokens.push({ type: 'url', href: m[0], value: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) pushText(text.slice(last));

  return tokens;
}
