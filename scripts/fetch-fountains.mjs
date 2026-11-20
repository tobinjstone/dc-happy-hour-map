// Builds the Fountain Cig data in fountain/data/: every US location of the
// chains listed in fountain/js/chains.js, from All The Places (open data
// scraped from each chain's own store locator, https://www.alltheplaces.xyz).
//
//   node scripts/fetch-fountains.mjs [--cache .cache/atp]
//
// The country is cut into half-degree squares (about 35 by 25 miles) so the
// map only loads the places on screen:
//   data/cells/<y>_<x>.json  the places in one square
//   data/index.json          how many places each square and chain has
//
// All The Places runs every week, and now and then a chain's scraper breaks
// and a run comes back short. So for each chain this uses the newest run whose
// count is close to the best of the last few weeks.
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { CHAINS } from '../fountain/js/chains.js';
import { CELL, COLUMNS, cellOf } from '../fountain/js/cells.js';
import { inUS } from '../fountain/js/report-model.js';

const HISTORY = 'https://data.alltheplaces.xyz/runs/history.json';
const RUNS = 'https://alltheplaces-data.openaddresses.io/runs';
const OUT = new URL('../fountain/data/', import.meta.url);
const LOOKBACK = 12;
const GOOD_ENOUGH = 0.9;

const STATE_NAMES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
  DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming'
};
const STATES = Object.fromEntries(Object.entries(STATE_NAMES).flatMap(([code, name]) => [[code, code], [name.toUpperCase(), code]]));

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
  if (!inUS(lng, lat)) return null;
  const p = f.properties || {};
  // One scraper can cover sister brands (7-Eleven's lists Speedway and Stripes,
  // plus each store's gas pumps on their own); keep just this chain's stores.
  if (chain.brand && p.brand !== chain.brand) return null;
  const country = String(p['addr:country'] || 'US').toUpperCase();
  if (country !== 'US' && country !== 'USA') return null;
  const state = STATES[String(p['addr:state'] || '').trim().toUpperCase()] || null;
  // Refs are store numbers, sometimes inside a URL ("...wendys.com/#2065479129").
  const ref = String(clean(p.ref) || '').split(/[#/]/).filter(Boolean).pop() || `${lat.toFixed(5)},${lng.toFixed(5)}`;
  let branch = clean(p.branch);
  if (!branch && p.name && p.name !== chain.name && p.name !== p.brand) branch = clean(p.name);
  const address = tidy(clean(p['addr:street_address']) || clean(p['addr:full']));
  // Some locators name each store by its street address; that's not a branch name.
  if (branch && address && (address.toLowerCase().includes(branch.toLowerCase()) || branch.toLowerCase().includes(address.toLowerCase()))) branch = null;
  return {
    id: `${chainKey}-${ref}`.replace(/[^\w.-]+/g, '_').slice(0, 80),
    chain: chainKey,
    lng: Number(lng.toFixed(5)),
    lat: Number(lat.toFixed(5)),
    branch,
    address,
    city: tidy(clean(p['addr:city'])),
    state,
    postcode: clean(p['addr:postcode']),
    phone: clean(p.phone),
    hours: clean(p.opening_hours),
    drive_hours: clean(p['opening_hours:drive_through']),
    drive_through: p.drive_through === 'yes' ? 1 : p.drive_through === 'no' ? 0 : null,
    website: clean(p.website)
  };
}

// Store locators sometimes list one store more than once (Wendy's has a page
// per menu). Same chain within 30 m is the same place: keep the fullest record
// and fill its gaps from the others. Places are bucketed by ~100 m so this
// stays quick across the whole country.
function dedupe(list) {
  const out = [];
  const buckets = new Map();
  const key = (chain, y, x) => `${chain}:${y}:${x}`;
  const near = (a, b) => {
    const dx = (a.lng - b.lng) * 111000 * Math.cos((a.lat * Math.PI) / 180);
    const dy = (a.lat - b.lat) * 111000;
    return dx * dx + dy * dy < 30 * 30;
  };
  const size = (p) => Object.values(p).filter((v) => v != null).length;
  const ids = new Map();
  for (const p of [...list].sort((a, b) => size(b) - size(a))) {
    const y = Math.round(p.lat * 1000);
    const x = Math.round(p.lng * 1000);
    let twin = ids.get(p.id);
    for (let dy = -1; dy <= 1 && !twin; dy++) {
      for (let dx = -1; dx <= 1 && !twin; dx++) {
        twin = (buckets.get(key(p.chain, y + dy, x + dx)) || []).find((o) => near(o, p));
      }
    }
    if (twin) {
      for (const [k, v] of Object.entries(p)) if (twin[k] == null) twin[k] = v;
      continue;
    }
    out.push(p);
    ids.set(p.id, p);
    const k = key(p.chain, y, x);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(p);
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

  const places = [];
  const sources = [];
  for (const [key, chain] of Object.entries(CHAINS)) {
    let count = 0;
    for (const spider of chain.spiders || []) {
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
      places.push(...here);
      sources.push({ chain: key, spider, run: run.slice(0, 10) });
    }
    console.log(`${chain.name.padEnd(30)} ${count}`);
  }

  const unique = dedupe(places);
  const cells = new Map();
  for (const p of unique) {
    const id = cellOf(p.lng, p.lat);
    if (!cells.has(id)) cells.set(id, []);
    cells.get(id).push(p);
  }

  const cellDir = new URL('cells/', OUT);
  await rm(cellDir, { recursive: true, force: true });
  await mkdir(cellDir, { recursive: true });
  const index = [];
  for (const [id, list] of [...cells].sort()) {
    list.sort((a, b) => a.id.localeCompare(b.id));
    const rows = list.map((p) => COLUMNS.map((c) => p[c] ?? null));
    await writeFile(new URL(`${id}.json`, cellDir), `${JSON.stringify({ columns: COLUMNS, rows }).replace(/\],\[/g, '],\n[')}\n`);
    // Where to draw the square's bubble on the zoomed-out map: the middle of its places.
    const lng = list.reduce((s, p) => s + p.lng, 0) / list.length;
    const lat = list.reduce((s, p) => s + p.lat, 0) / list.length;
    index.push([id, list.length, Number(lng.toFixed(3)), Number(lat.toFixed(3))]);
  }
  const chains = {};
  for (const p of unique) chains[p.chain] = (chains[p.chain] || 0) + 1;
  const updated = sources.map((s) => s.run).sort().pop();
  await writeFile(new URL('index.json', OUT), `${JSON.stringify({
    updated,
    cell: CELL,
    total: unique.length,
    source: "All The Places (alltheplaces.xyz), from each chain's store locator",
    sources,
    chains,
    cells: index
  }).replace(/\],\[/g, '],\n[')}\n`);
  await rm(new URL('places.geojson', OUT), { force: true });
  console.log(`\nwrote ${unique.length} places in ${index.length} squares to fountain/data/`);
}

main().catch((e) => { console.error(e); process.exit(1); });
