// Outline glyphs from the design system's icon set (Tabler, 24px grid, 2px
// stroke). Decorative: the control around one carries the accessible name.
const PATHS = {
  plus: ['M12 5l0 14', 'M5 12l14 0'],
  user: ['M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0', 'M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2'],
  search: ['M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0', 'M21 21l-6 -6'],
  x: ['M18 6l-12 12', 'M6 6l12 12'],
  funnel: [
    'M4 4h16v2.172a2 2 0 0 1 -.586 1.414l-4.414 4.414v7l-6 2v-8.5l-4.48 -4.928a2 2 0 0 1 -.52 -1.345v-2.227',
  ],
  'chevron-left': ['M15 6l-6 6l6 6'],
  'chevron-right': ['M9 6l6 6l-6 6'],
  'chevron-down': ['M6 9l6 6l6 -6'],
  ellipsis: [
    'M4 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0',
    'M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0',
    'M18 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0',
  ],
  share: [
    'M3 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0',
    'M15 6a3 3 0 1 0 6 0a3 3 0 1 0 -6 0',
    'M15 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0',
    'M8.7 10.7l6.6 -3.4',
    'M8.7 13.3l6.6 3.4',
  ],
  copy: [
    'M7 9.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667l0 -8.666',
    'M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1',
  ],
  pencil: ['M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4', 'M13.5 6.5l4 4'],
  'book-open': [
    'M3 19a9 9 0 0 1 9 0a9 9 0 0 1 9 0',
    'M3 6a9 9 0 0 1 9 0a9 9 0 0 1 9 0',
    'M3 6l0 13',
    'M12 6l0 13',
    'M21 6l0 13',
  ],
  palette: [
    'M12 21a9 9 0 0 1 0 -18c4.97 0 9 3.582 9 8c0 1.06 -.474 2.078 -1.318 2.828c-.844 .75 -1.989 1.172 -3.182 1.172h-2.5a2 2 0 0 0 -1 3.75a1.3 1.3 0 0 1 -1 2.25',
    'M7.5 10.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0',
    'M11.5 7.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0',
    'M15.5 10.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0',
  ],
  hash: ['M5 9l14 0', 'M5 15l14 0', 'M11 4l-4 16', 'M17 4l-4 16'],
};

export default function Icon({ name, size = 18 }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
