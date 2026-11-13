// Builds fountain/data/places.geojson: every location in the DMV of the chains
// listed in fountain/js/chains.js, from All The Places (open data scraped from
// each chain's own store locator, https://www.alltheplaces.xyz).
//
//   node scripts/fetch-fountains.mjs [--cache .cache/atp]
//
// All The Places runs every week, and now and then a chain's scraper breaks
// and a run comes back short. So for each chain this uses the newest run whose
// count is close to the best of the last few weeks.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { CHAINS } from '../fountain/js/chains.js';

const HISTORY = 'https://data.alltheplaces.xyz/runs/history.json';
const RUNS = 'https://alltheplaces-data.openaddresses.io/runs';
const OUT = new URL('../fountain/data/places.geojson', import.meta.url);
// DC plus the close-in suburbs: Montgomery, Prince George's, Howard's south
// end, Arlington, Alexandria, Fairfax, Loudoun's east end, Prince William.
const [W, S, E, N] = [-77.65, 38.6, -76.65, 39.25];
const STATES = { DC: 'DC', 'DISTRICT OF COLUMBIA': 'DC', MD: 'MD', MARYLAND: 'MD', VA: 'VA', VIRGINIA: 'VA' };
// When a locator leaves out the state, the ZIP code's first three digits say it.
function stateOf(p) {
  const named = STATES[String(p?.['addr:state'] || '').trim().toUpperCase()];
  if (named) return named;
  const z = Number(String(p?.['addr:postcode'] || '').slice(0, 3));
  if (z === 200 || (z >= 202 && z <= 205)) return 'DC';
  if (z >= 206 && z <= 219) return 'MD';
  if (z === 201 || (z >= 220 && z <= 246)) return 'VA';
  return null;
}
const LOOKBACK = 12;
const GOOD_ENOUGH = 0.9;

const args = process.argv.slice(2);
const cacheDir = args.includes('--cache') ? args[args.indexOf('--cache') + 1] : '.cache/atp';

async function cached(url, file) {
  const p = path.join(cacheDir, file);
  if (existsSync(p)) return JSON.parse(await readFile(p, 'utf8'));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const text = await res.text();
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, text);
  return JSON.parse(text);
}

async function json(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

const clean = (v) => (v == null ? null : String(v).replace(/\s+/g, ' ').trim() || null);

// Some locators shout ("1916 M ST NW"), whisper ("1250 h st nw") or write
// "Nw"; tidy all three.
function tidy(s) {
  if (!s) return s;
  const oneCase = s === s.toUpperCase() || s === s.toLowerCase();
  let out = oneCase ? s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()) : s;
  out = out.replace(/\b(nw|ne|sw|se)\b\.?/gi, (d) => d.replace('.', '').toUpperCase()).replace(/\.{2,}/g, '.');
  out = out.replace(/(\d)(st|nd|rd|th)\b/gi, (_, n, x) => n + x.toLowerCase());
  return out;
}

function toPlace(chainKey, chain, f) {
  const g = f.geometry;
  if (!g || g.type !== 'Point') return null;
  const [lng, lat] = g.coordinates.map(Number);
  if (!(lng >= W && lng <= E && lat >= S && lat <= N)) return null;
  const p = f.properties || {};
  const state = stateOf(p);
  if (!state) return null;
  // Refs are store numbers, sometimes inside a URL ("...wendys.com/#2065479129").
  const ref = String(clean(p.ref) || '').split(/[#/]/).filter(Boolean).pop() || `${lat.toFixed(5)},${lng.toFixed(5)}`;
  let branch = clean(p.branch);
  if (!branch && p.name && p.name !== chain.name && p.name !== p.brand) branch = clean(p.name);
  const address = tidy(clean(p['addr:street_address']) || clean(p['addr:full']));
  // Some locators name each store by its street address; that's not a branch name.
  if (branch && address && (address.toLowerCase().includes(branch.toLowerCase()) || branch.toLowerCase().includes(address.toLowerCase()))) branch = null;
  const dt = p.drive_through === 'yes' ? true : p.drive_through === 'no' ? false : null;
  const props = {
    id: `${chainKey}-${ref}`.replace(/[^\w.-]+/g, '_').slice(0, 80),
    chain: chainKey,
    branch,
    address,
    city: tidy(clean(p['addr:city'])),
    state,
    postcode: clean(p['addr:postcode']),
    phone: clean(p.phone),
    website: clean(p.website),
    hours: clean(p.opening_hours),
    drive_hours: clean(p['opening_hours:drive_through']),
    drive_through: dt
  };
  for (const k of Object.keys(props)) if (props[k] === null) delete props[k];
  return { type: 'Feature', geometry: { type: 'Point', coordinates: [Number(lng.toFixed(6)), Number(lat.toFixed(6))] }, properties: props };
}

// Store locators sometimes list one store more than once (Wendy's has a page
// per menu). Same chain within 30 m is the same place: keep the fullest record
// and fill its gaps from the others.
function dedupe(list) {
  const out = [];
  const near = (a, b) => {
    const [x1, y1] = a.geometry.coordinates;
    const [x2, y2] = b.geometry.coordinates;
    const dx = (x1 - x2) * 86000;
    const dy = (y1 - y2) * 111000;
    return dx * dx + dy * dy < 30 * 30;
  };
  const size = (f) => Object.keys(f.properties).length;
  for (const f of [...list].sort((a, b) => size(b) - size(a))) {
    const twin = out.find((o) => o.properties.chain === f.properties.chain && (o.properties.id === f.properties.id || near(o, f)));
    if (!twin) { out.push(f); continue; }
    for (const [k, v] of Object.entries(f.properties)) if (twin.properties[k] == null) twin.properties[k] = v;
  }
  return out;
}

async function main() {
  const history = await json(HISTORY);
  const runs = history.slice(-LOOKBACK).map((r) => r.run_id).reverse();
  const stats = new Map();
  for (const run of runs) {
    try {
      const s = await cached(`${RUNS}/${run}/stats/_results.json`, `${run}/_results.json`);
      stats.set(run, new Map(s.results.map((r) => [r.spider, r.features])));
    } catch (e) {
      console.warn(`skipping run ${run}: ${e.message}`);
    }
  }

  const features = [];
  const sources = [];
  for (const [key, chain] of Object.entries(CHAINS)) {
    if (!chain.spiders?.length) continue;
    let count = 0;
    for (const spider of chain.spiders) {
      const counts = runs.map((r) => stats.get(r)?.get(spider) ?? 0);
      const best = Math.max(...counts);
      if (!best) { console.warn(`${spider}: no good run in the last ${runs.length} weeks`); continue; }
      // Newest run with a full count. A run can also come back with every
      // store but no coordinates, so check that too and fall back a week.
      let run = null;
      let fc = null;
      for (const [i, r] of runs.entries()) {
        if (counts[i] < GOOD_ENOUGH * best) continue;
        const data = await cached(`${RUNS}/${r}/output/${spider}.geojson`, `${r}/${spider}.geojson`);
        const located = (data.features || []).filter((f) => f.geometry?.type === 'Point').length;
        if (located >= 0.8 * (data.features || []).length) { run = r; fc = data; break; }
        console.warn(`${spider}: run ${r} has stores without coordinates, trying an older one`);
      }
      if (!fc) { console.warn(`${spider}: no usable run`); continue; }
      const here = (fc.features || []).map((f) => toPlace(key, chain, f)).filter(Boolean);
      count += here.length;
      features.push(...here);
      sources.push({ chain: key, spider, run: run.slice(0, 10) });
    }
    console.log(`${chain.name.padEnd(28)} ${count}`);
  }

  const places = dedupe(features).sort((a, b) => a.properties.id.localeCompare(b.properties.id));
  const updated = sources.map((s) => s.run).sort().pop();
  const body = [
    '{"type":"FeatureCollection",',
    `"updated":${JSON.stringify(updated)},`,
    `"source":"All The Places (alltheplaces.xyz), from each chain's store locator",`,
    `"sources":${JSON.stringify(sources)},`,
    '"features":[',
    places.map((f) => JSON.stringify(f)).join(',\n'),
    ']}\n'
  ].join('\n');
  await writeFile(OUT, body);
  console.log(`\nwrote ${places.length} places to fountain/data/places.geojson`);
}

main().catch((e) => { console.error(e); process.exit(1); });
