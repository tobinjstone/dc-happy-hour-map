// Builds the "transit lines": for each deal type, a minimum spanning tree
// joining every stop that offers it, so each line reads as one connected route.

export const LINES = {
  beer: { letter: 'B', label: 'Beer', color: '#D7262E', text: '#FFFFFF', offset: -4.5 },
  wine: { letter: 'W', label: 'Wine', color: '#1B67C9', text: '#FFFFFF', offset: -1.5 },
  cocktail: { letter: 'C', label: 'Cocktails', color: '#F08A00', text: '#111111', offset: 1.5 },
  late: { letter: 'L', label: 'Late night', color: '#17834A', text: '#FFFFFF', offset: 4.5 }
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
    const [h, m] = String(w.start || '0:0').split(':').map(Number);
    if (h * 60 + (m || 0) >= LATE_START || h < 4) set.add('late');
  }
  return LINE_ORDER.filter((k) => set.has(k));
}

function dist2(a, b) {
  // Rough equirectangular distance; plenty for a city-sized map.
  const dx = (a[0] - b[0]) * Math.cos((a[1] * Math.PI) / 180);
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

// Prim's algorithm over points ([lng, lat]); returns index pairs.
export function mstEdges(points) {
  const n = points.length;
  if (n < 2) return [];
  const inTree = new Array(n).fill(false);
  const best = new Array(n).fill(Infinity);
  const from = new Array(n).fill(-1);
  const edges = [];
  best[0] = 0;
  for (let k = 0; k < n; k++) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!inTree[i] && (u < 0 || best[i] < best[u])) u = i;
    inTree[u] = true;
    if (from[u] >= 0) edges.push([from[u], u]);
    for (let v = 0; v < n; v++) {
      if (inTree[v]) continue;
      const d = dist2(points[u], points[v]);
      if (d < best[v]) { best[v] = d; from[v] = u; }
    }
  }
  return edges;
}

// stops: [{ coords: [lng, lat], lines: ['beer', ...] }]
export function lineFeatures(stops) {
  const features = [];
  for (const key of LINE_ORDER) {
    const pts = stops.filter((s) => s.lines.includes(key)).map((s) => s.coords);
    for (const [a, b] of mstEdges(pts)) {
      features.push({
        type: 'Feature',
        properties: { line: key },
        geometry: { type: 'LineString', coordinates: [pts[a], pts[b]] }
      });
    }
  }
  return { type: 'FeatureCollection', features };
}
