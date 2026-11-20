// Shared by the site and the report server: what a fizz report and a
// visitor-added spot look like, how they're checked, and how a place's
// reports add up to what the map shows.

export const STATUSES = {
  pouring: 'Diet Coke on the fountain',
  out: 'Diet Coke was out or broken',
  none: 'No fountain Diet Coke here'
};
export const FIZZ = { 1: 'Flat', 2: 'Weak', 3: 'Fine', 4: 'Crisp', 5: 'Perfect' };
export const TAGS = {
  freestyle: 'Freestyle machine',
  self_serve: 'Self-serve',
  nugget_ice: 'Nugget ice',
  free_refills: 'Free refills'
};
// Where a visitor can add a spot: the 50 states and DC, as boxes around the
// lower 48, Alaska and Hawaii (the same ones the chain data uses).
export const US_BOXES = [[-125.0, 24.3, -66.8, 49.5], [-179.2, 51.2, -129.9, 71.5], [-160.6, 18.8, -154.7, 22.3]];
export const inUS = (lng, lat) => US_BOXES.some(([w, s, e, n]) => lng >= w && lng <= e && lat >= s && lat <= n);

// How long each kind of report keeps saying something about a place.
// A machine that's out usually gets fixed within a day or two.
const FRESH_DAYS = { pouring: 60, none: 365, out: 2 };
const RATING_DAYS = 365;
const MAX_NOTE = 140;
const ID = /^[\w.:-]{1,80}$/;

const text = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export function parsePrice(input) {
  const s = String(input ?? '').trim();
  if (!s) return null;
  const m = s.match(/^\$?\s*(\d{1,2}(?:\.\d{1,2})?)$/);
  if (!m) return undefined;
  const n = Number(m[1]);
  return n <= 20 ? n : undefined;
}

// Returns { report } or { error }.
export function validateReport(input) {
  const placeId = text(input?.place_id, 80);
  if (!ID.test(placeId)) return { error: 'Missing which place this is for.' };
  const status = String(input.status || '');
  if (!STATUSES[status]) return { error: 'Pick how it went: poured, out, or no Diet Coke here.' };
  let fizz = input.fizz == null || input.fizz === '' ? null : Number(input.fizz);
  if (fizz !== null && !(Number.isInteger(fizz) && fizz >= 1 && fizz <= 5)) return { error: 'Fizz is rated 1 to 5.' };
  if (status !== 'pouring') fizz = null;
  const price = status === 'pouring' ? parsePrice(input.price) : null;
  if (price === undefined) return { error: 'Price should look like 1.29 (and under $20).' };
  const tags = Object.keys(TAGS).filter((t) => Array.isArray(input.tags) && input.tags.includes(t));
  return { report: { place_id: placeId, status, fizz, price, tags, note: text(input.note, MAX_NOTE) || null } };
}

// A spot someone adds by dropping a pin. Returns { place } or { error }.
export function validatePlace(input) {
  const name = text(input?.name, 80);
  if (name.length < 2) return { error: 'Give the place a name.' };
  const lat = Number(input.lat);
  const lng = Number(input.lng);
  if (!inUS(lng, lat)) return { error: 'Drop the pin somewhere in the US.' };
  return { place: { name, address: text(input.address, 120) || null, lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) } };
}

const ageDays = (iso, now) => (now - Date.parse(iso)) / 86400000;

// Adds up one place's reports into what the map shows:
// { status, statusAt, fizz, rated, count, tags: { tag: n }, latest, price }
export function summarize(reports, now = Date.now()) {
  const list = [...(reports || [])].filter((r) => r && r.created_at).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const out = { status: null, statusAt: null, fizz: null, rated: 0, count: list.length, tags: {}, latest: list[0] || null, price: null };
  for (const r of list) {
    if (ageDays(r.created_at, now) <= (FRESH_DAYS[r.status] ?? 0)) {
      out.status = r.status;
      out.statusAt = r.created_at;
      break;
    }
  }
  let sum = 0;
  for (const r of list) {
    if (ageDays(r.created_at, now) > RATING_DAYS) continue;
    if (r.fizz) { sum += r.fizz; out.rated++; }
    for (const t of r.tags || []) out.tags[t] = (out.tags[t] || 0) + 1;
    if (out.price === null && typeof r.price === 'number') out.price = r.price;
  }
  if (out.rated) out.fizz = Math.round((sum / out.rated) * 10) / 10;
  return out;
}
