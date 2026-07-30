// Category colors run from butter yellow to aubergine and text sits straight on
// them, so pick the ink by luminance instead of always going light.
export function inkFor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!m) return '#fff8ef';
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.62 ? '#2a2622' : '#fff8ef';
}
