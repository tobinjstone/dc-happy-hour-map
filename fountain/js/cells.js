// The country is cut into half-degree squares (about 35 by 25 miles), one data
// file each, so the map only loads the places on screen. Shared by the site
// and scripts/fetch-fountains.mjs.

export const CELL = 0.5;

// The columns of each place in a square's file, in order.
export const COLUMNS = ['id', 'chain', 'lng', 'lat', 'branch', 'address', 'city', 'state', 'postcode', 'phone', 'hours', 'drive_hours', 'drive_through', 'website'];

export const cellOf = (lng, lat) => `${Math.floor(lat / CELL)}_${Math.floor(lng / CELL)}`;

// Every square touching a box given as [west, south, east, north].
export function cellsIn([w, s, e, n]) {
  const out = [];
  for (let y = Math.floor(s / CELL); y <= Math.floor(n / CELL); y++) {
    for (let x = Math.floor(w / CELL); x <= Math.floor(e / CELL); x++) out.push(`${y}_${x}`);
  }
  return out;
}

// The squares within `rings` squares of a point, nearest first.
export function cellsAround(lng, lat, rings) {
  const y0 = Math.floor(lat / CELL);
  const x0 = Math.floor(lng / CELL);
  const out = [];
  for (let r = 0; r <= rings; r++) {
    for (let y = y0 - r; y <= y0 + r; y++) {
      for (let x = x0 - r; x <= x0 + r; x++) {
        if (Math.max(Math.abs(y - y0), Math.abs(x - x0)) === r) out.push(`${y}_${x}`);
      }
    }
  }
  return out;
}

// Turns a square's file back into place records.
export function readCell(data) {
  const cols = data.columns || COLUMNS;
  return (data.rows || []).map((row) => Object.fromEntries(cols.map((c, i) => [c, row[i]])));
}
