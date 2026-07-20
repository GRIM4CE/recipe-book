// Ingredient scaling. Parses the leading quantity (and optional unit) off an
// ingredient line, multiplies it, and rewrites it in whatever measurement
// reads best: 8 tbsp becomes "1/2 cup", 1/4 tbsp becomes "3/4 tsp",
// 10 tbsp becomes "1/2 cup + 2 tbsp". Lines with no leading number pass
// through untouched.

const EPS = 1e-6;

const UNICODE_FRACTIONS = {
  '¼': 1 / 4, '½': 1 / 2, '¾': 3 / 4,
  '⅓': 1 / 3, '⅔': 2 / 3,
  '⅙': 1 / 6, '⅚': 5 / 6,
  '⅛': 1 / 8, '⅜': 3 / 8, '⅝': 5 / 8, '⅞': 7 / 8,
};

const FRACTION_CHARS = Object.keys(UNICODE_FRACTIONS).join('');

// A quantity: "1 1/2", "1/2", "1½", "½", "1.5", or "3".
const NUM = `(?:\\d+\\s+\\d+\\s*/\\s*\\d+|\\d+\\s*/\\s*\\d+|\\d*\\s*[${FRACTION_CHARS}]|\\d+(?:\\.\\d+)?)`;

const LEAD = new RegExp(`^(${NUM})(\\s*([-–—])\\s*(${NUM}))?([\\s\\S]*)$`);
const UNIT_WORD = /^\s*([A-Za-z]+)\.?(?=[\s,)]|$)/;
const FIRST_NUM = new RegExp(`(${NUM})(\\s*([-–—])\\s*(${NUM}))?`);

// Teaspoons per unit, for the units we re-express when scaling. Single
// letters are case-sensitive (t = tsp, T = tbsp); everything else is not.
const VOLUME_UNITS = {
  tsp: 1, tsps: 1, teaspoon: 1, teaspoons: 1, t: 1,
  tbsp: 3, tbsps: 3, tbs: 3, tablespoon: 3, tablespoons: 3, T: 3,
  cup: 48, cups: 48, c: 48, C: 48,
};

const gcd = (a, b) => (b ? gcd(b, a % b) : a);

function volumeTsp(word) {
  const key = word.length === 1 ? word : word.toLowerCase();
  return VOLUME_UNITS[key] ?? null;
}

function parseQuantity(str) {
  const s = str.trim();
  const uni = s.match(new RegExp(`^(\\d*)\\s*([${FRACTION_CHARS}])$`));
  if (uni) return Number(uni[1] || 0) + UNICODE_FRACTIONS[uni[2]];
  const mixed = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  return Number(s);
}

function formatNumber(v) {
  const rounded = Math.round(v);
  if (Math.abs(v - rounded) < EPS) return String(rounded);
  // Large amounts (28 oz, 250 g): a fraction reads worse than rounding.
  if (v >= 10) return String(rounded);
  const whole = Math.floor(v + EPS);
  const frac = v - whole;
  for (const d of [2, 3, 4, 6, 8, 16]) {
    const n = Math.round(frac * d);
    if (n > 0 && n < d && Math.abs(frac - n / d) < EPS) {
      return whole ? `${whole} ${n}/${d}` : `${n}/${d}`;
    }
  }
  // No clean fraction: snap to the nearest sixteenth rather than print 1/28.
  const sixteenths = Math.max(1, Math.round(v * 16));
  const w = Math.floor(sixteenths / 16);
  const n = sixteenths % 16;
  if (n === 0) return String(w);
  const div = gcd(n, 16);
  const fr = `${n / div}/${16 / div}`;
  return w ? `${w} ${fr}` : fr;
}

function cupStr(cups) {
  return `${formatNumber(cups)} ${cups > 1 + EPS ? 'cups' : 'cup'}`;
}

// Under 1/4 cup: tablespoons (whole or half), remainder in teaspoons.
function formatSmallVolume(tsp) {
  if (tsp >= 3 - EPS) {
    const tbsp = tsp / 3;
    if (Math.abs(tbsp * 2 - Math.round(tbsp * 2)) < EPS) return `${formatNumber(tbsp)} tbsp`;
    const whole = Math.floor(tbsp + EPS);
    return `${whole} tbsp + ${formatSmallVolume(tsp - whole * 3)}`;
  }
  return `${formatNumber(tsp)} tsp`;
}

function formatVolume(tsp) {
  if (tsp >= 12 - EPS) {
    const cups = tsp / 48;
    // Measurable as-is (whole cups, halves, thirds, or quarters)?
    for (const d of [1, 2, 3, 4]) {
      if (Math.abs(cups * d - Math.round(cups * d)) < EPS) return cupStr(cups);
    }
    // Otherwise: largest measurable quarter-cup, remainder in spoons.
    const base = Math.floor(cups * 4 + EPS) / 4;
    return `${cupStr(base)} + ${formatSmallVolume(tsp - base * 48)}`;
  }
  return formatSmallVolume(tsp);
}

export function scaleIngredient(line, factor) {
  if (factor === 1) return line;
  const m = line.match(LEAD);
  if (!m) return line;
  const [, first, , sep, second, tail] = m;
  const qty = parseQuantity(first);
  if (!Number.isFinite(qty)) return line;
  if (second !== undefined) {
    // Ranges scale numerically and keep the unit as written — a composite
    // rewrite like "1/2 cup + 2 tbsp" on both ends would be unreadable.
    return `${formatNumber(qty * factor)}${sep}${formatNumber(parseQuantity(second) * factor)}${tail}`;
  }
  const unit = tail.match(UNIT_WORD);
  const tspPer = unit ? volumeTsp(unit[1]) : null;
  if (tspPer) {
    return `${formatVolume(qty * factor * tspPer)}${tail.slice(unit[0].length)}`;
  }
  return `${formatNumber(qty * factor)}${tail}`;
}

// Scales the first number (or range) in a free-text servings field:
// "4" -> "8", "Serves 4–6" -> "Serves 8–12".
export function scaleServings(text, factor) {
  if (factor === 1 || !text) return text;
  return text.replace(FIRST_NUM, (match, first, _range, sep, second) => {
    const a = formatNumber(parseQuantity(first) * factor);
    if (second === undefined) return a;
    return `${a}${sep}${formatNumber(parseQuantity(second) * factor)}`;
  });
}
