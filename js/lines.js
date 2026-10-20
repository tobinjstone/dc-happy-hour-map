// The "transit lines": each deal type is a line with its own color and
// lettered bullet, and a stop sits on every line it has deals for.

export const LINES = {
  beer: { letter: 'B', label: 'Beer', color: '#D7262E', text: '#FFFFFF' },
  wine: { letter: 'W', label: 'Wine', color: '#1B67C9', text: '#FFFFFF' },
  cocktail: { letter: 'C', label: 'Cocktails', color: '#F08A00', text: '#111111' },
  late: { letter: 'L', label: 'Late night', color: '#17834A', text: '#FFFFFF' }
};
export const LINE_ORDER = ['beer', 'wine', 'cocktail', 'late'];

const LATE_START = 21 * 60;

// Which lines a venue sits on, from its deals and windows.
export function linesFor(venue) {
  const set = new Set();
  for (const d of venue.deals || []) {
    if (d.category === 'beer') set.add('beer');
    else if (d.category === 'wine') set.add('wine');
    else if (d.category === 'cocktail' || d.category === 'spirits') set.add('cocktail');
  }
  for (const w of venue.windows || []) {
    // All-day and untimed windows aren't late-night specials.
    if (!w.start) continue;
    const [h, m] = String(w.start).split(':').map(Number);
    if (h * 60 + (m || 0) >= LATE_START || h < 4) set.add('late');
  }
  return LINE_ORDER.filter((k) => set.has(k));
}
