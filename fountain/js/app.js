import { fmtDate, fmtAge, daysSince } from '../../js/time.js';
import { parseHours, openAt, openNote, weekRows } from './hours.js';
import { CHAINS, SPOT, POURS, FREESTYLE, NOT_HERE } from './chains.js';
import { FIZZ, TAGS, STATUSES, summarize } from './report-model.js';
import { sharing, fetchShared, readLog } from './reports.js';
import { openReport, openAddSpot, openLog } from './dialogs.js';
import { esc, fizzHtml, chipHtml, fmtMiles } from './ui.js';
import { cellsIn, cellsAround, readCell } from './cells.js';
import { zoneOf, nowIn } from './zones.js';

const PAGE = 15;
const MOBILE = window.matchMedia('(max-width: 820px)');
const KIND_RANK = { confirmed: 0, likely: 1, out: 2 };
// Zoomed out, the map shows a bubble per half-degree square; from this zoom
// in, it loads the squares on screen and shows each place.
const DETAIL_ZOOM = 9;
// Squares kept in memory while panning around the country.
const MAX_CELLS = 120;
// The lower 48, fitted to whatever screen this is.
const US_BOUNDS = [[-124.8, 24.4], [-66.9, 49.4]];
const US_CENTER = [-96.5, 38.6];
const VIEW_KEY = 'fountain-cig:view';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

const state = {
  index: { cells: new Map(), chains: {}, total: 0, updated: '' },
  cells: new Map(),
  pending: new Map(),
  places: [],
  shared: { reports: [], places: [] },
  log: [],
  summaries: new Map(),
  reports: new Map(),
  // The time right now in each zone a place keeps, worked out once a minute.
  clocks: new Map(),
  openOnly: true,
  filters: new Set(),
  chainsOff: new Set(),
  selected: null,
  me: null,
  center: US_CENTER,
  bounds: null,
  detail: false,
  shown: PAGE,
  picking: false
};

const $ = (id) => document.getElementById(id);

function clockIn(zone) {
  if (!state.clocks.has(zone)) state.clocks.set(zone, nowIn(zone));
  return state.clocks.get(zone);
}

// ---------- Data ----------

function fromRecord(p) {
  const chain = CHAINS[p.chain];
  if (!chain) return null;
  const lng = Number(p.lng);
  const lat = Number(p.lat);
  return {
    id: p.id,
    chainKey: p.chain,
    chain,
    name: chain.name,
    branch: p.branch || '',
    address: p.address || '',
    city: p.city || '',
    state: p.state || '',
    postcode: p.postcode || '',
    phone: p.phone || '',
    website: p.website || '',
    hours: parseHours(p.hours),
    driveHours: parseHours(p.drive_hours),
    drive: p.drive_through === 1 || !!p.drive_hours,
    zone: zoneOf(p.state, lng, lat),
    coords: [lng, lat]
  };
}

// A spot a visitor added: shared ones from the server, or ones in your own log.
function fromSpot(s) {
  const lng = Number(s.lng);
  const lat = Number(s.lat);
  return {
    id: s.id,
    chainKey: 'spot',
    chain: SPOT,
    name: s.name,
    branch: '',
    address: s.address || '',
    city: '',
    state: '',
    postcode: '',
    phone: '',
    website: '',
    hours: null,
    driveHours: null,
    drive: false,
    spot: true,
    localOnly: !!s.localOnly,
    addedAt: s.created_at,
    zone: zoneOf(null, lng, lat),
    coords: [lng, lat]
  };
}

async function loadIndex() {
  try {
    const res = await fetch('data/index.json', { cache: 'no-cache' });
    const d = await res.json();
    state.index = {
      cells: new Map(d.cells.map(([id, count, lng, lat]) => [id, { count, lng, lat }])),
      chains: d.chains || {},
      total: d.total || 0,
      updated: d.updated || ''
    };
  } catch {
    // Shown as an empty map with the message in the list.
  }
}

// Fetches one square's places, unless it's loaded, loading, or has none.
function loadCell(id) {
  if (state.cells.has(id)) {
    // Most recently used goes to the back, so the oldest square is dropped first.
    const v = state.cells.get(id);
    state.cells.delete(id);
    state.cells.set(id, v);
    return null;
  }
  if (!state.index.cells.has(id)) return null;
  if (state.pending.has(id)) return state.pending.get(id);
  const p = fetch(`data/cells/${id}.json`)
    .then((r) => r.json())
    .then((d) => { state.cells.set(id, readCell(d).map(fromRecord).filter(Boolean)); })
    .catch(() => {})
    .finally(() => state.pending.delete(id));
  state.pending.set(id, p);
  return p;
}

async function loadCells(ids) {
  const waits = ids.map(loadCell).filter(Boolean);
  if (waits.length) await Promise.all(waits);
  const keep = new Set(ids);
  for (const id of state.cells.keys()) {
    if (state.cells.size <= MAX_CELLS) break;
    if (!keep.has(id)) state.cells.delete(id);
  }
  state.places = [...state.cells.values()].flat();
}

// Shared reports plus your own, so what you just logged shows straight away
// (and is all there is, when the report server isn't set up).
function rebuildReports() {
  const byPlace = new Map();
  const sharedIds = new Set();
  for (const r of state.shared.reports) {
    sharedIds.add(r.id);
    if (!byPlace.has(r.place_id)) byPlace.set(r.place_id, []);
    byPlace.get(r.place_id).push(r);
  }
  for (const e of state.log) {
    if (e.shared_id && sharedIds.has(e.shared_id)) continue;
    if (!byPlace.has(e.place_id)) byPlace.set(e.place_id, []);
    byPlace.get(e.place_id).push({ ...e, mine: true });
  }
  state.reports = byPlace;
  state.summaries = new Map([...byPlace].map(([id, list]) => [id, summarize(list)]));
}

function spots() {
  const out = new Map();
  for (const s of state.shared.places) out.set(s.id, fromSpot(s));
  for (const e of state.log) {
    if (e.spot && !out.has(e.place_id)) out.set(e.place_id, fromSpot({ ...e.spot, id: e.place_id, localOnly: !sharing() || !e.shared_id, created_at: e.created_at }));
  }
  return [...out.values()];
}

const allPlaces = () => [...state.places, ...spots()];

// ---------- Derived view ----------

const EMPTY = summarize([]);

function miles([lng1, lat1], [lng2, lat2]) {
  const r = (d) => (d * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(a));
}

function decorate(p, from) {
  const moment = clockIn(p.zone);
  const lobby = openAt(p.hours, moment);
  const drive = p.driveHours ? openAt(p.driveHours, moment) : null;
  let open = null;
  if (!lobby.unknown) open = lobby.open;
  if (drive && !drive.unknown) open = open || drive.open;
  const sum = state.summaries.get(p.id) || EMPTY;
  return {
    ...p,
    moment,
    lobby,
    driveSt: drive,
    open,
    sum,
    // Red when people say it's pouring, gray when it's out or missing,
    // white when the chain pours Coke but nobody has checked this one.
    kind: sum.status === 'pouring' ? 'confirmed' : sum.status ? 'out' : 'likely',
    always: !!(p.hours?.always || p.driveHours?.always),
    freestyle: p.chain.freestyle === 'most' || !!sum.tags.freestyle,
    dist: miles(from, p.coords)
  };
}

function isVisible(v) {
  if (state.openOnly && v.open === false) return false;
  if (state.filters.has('drive') && !v.drive) return false;
  if (state.filters.has('freestyle') && !v.freestyle) return false;
  if (state.filters.has('allnight') && !v.always) return false;
  if (state.filters.has('confirmed') && v.kind !== 'confirmed') return false;
  if (state.chainsOff.has(v.chainKey)) return false;
  return true;
}

const origin = () => state.me || state.center;

function view() {
  const from = origin();
  const all = allPlaces().map((p) => decorate(p, from));
  return { all, visible: all.filter(isVisible) };
}

const byCloseness = (a, b) => a.dist - b.dist;

// The one to send someone to: the nearest that's known to be open and not
// reported out, or failing that the nearest whose hours we don't know.
function closestOpen(visible) {
  const ok = visible.filter((v) => v.kind !== 'out').sort(byCloseness);
  return ok.find((v) => v.open === true) || ok.find((v) => v.open === null);
}

function inView(v) {
  const b = state.bounds;
  if (!b) return true;
  const [lng, lat] = v.coords;
  return lng >= b[0] && lng <= b[2] && lat >= b[1] && lat <= b[3];
}

// ---------- Small pieces ----------

function placeLine(v) {
  const where = [v.branch, v.address].filter(Boolean).join(' · ');
  const town = [v.city, v.state].filter(Boolean).join(', ');
  return [where, town].filter(Boolean).join(' · ');
}

function openClass(v) {
  if (v.open === null) return 'unknown';
  if (!v.open) return 'closed';
  const left = Math.min(v.lobby.open ? v.lobby.minsLeft ?? Infinity : Infinity, v.driveSt?.open ? v.driveSt.minsLeft ?? Infinity : Infinity);
  return left <= 60 && !v.always ? 'soon' : 'open';
}

function openText(v) {
  const drive = () => `Drive-thru ${openNote(v.driveSt, v.moment).replace(/^./, (c) => c.toLowerCase())}`;
  // When the lobby is closed (or its hours unknown) the drive-thru may still be serving.
  if (v.driveSt && !v.driveSt.unknown && (v.lobby.unknown || (!v.lobby.open && v.driveSt.open))) return drive();
  if (v.lobby.unknown) return 'Hours not listed';
  return openNote(v.lobby, v.moment);
}

// Hours are the place's own local time; say so when that isn't the visitor's.
function zoneNote(v) {
  const mine = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const fmt = (z) => new Intl.DateTimeFormat('en-US', { timeZone: z, timeZoneName: 'short' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value;
  return fmt(v.zone) !== fmt(mine) ? ` <span class="zone">${esc(fmt(v.zone))}</span>` : '';
}

function verdict(v) {
  const s = v.sum;
  if (s.status === 'pouring') return { cls: 'confirmed', pill: 'Pouring', note: `Confirmed ${fmtAge(daysSince(s.statusAt.slice(0, 10)))}` };
  if (s.status === 'out') return { cls: 'out', pill: 'Out', note: `Reported out ${fmtAge(daysSince(s.statusAt.slice(0, 10)))}` };
  if (s.status === 'none') return { cls: 'out', pill: 'No Diet Coke', note: 'Someone said there\'s no fountain Diet Coke here' };
  if (v.spot) return { cls: 'likely', pill: 'Added by a visitor', note: 'No recent reports' };
  return { cls: 'likely', pill: POURS[v.chain.pours]?.pill || 'Likely', note: 'Not confirmed at this location yet' };
}

// ---------- Rendering ----------

function renderList(visible) {
  const list = $('nearby');
  if (!state.detail && !state.me) {
    $('nearby-title').textContent = 'Across the country';
    $('nearby-count').textContent = state.index.total ? `${state.index.total.toLocaleString()} places` : '';
    list.innerHTML = '<li class="empty">Zoom in on a town, search for one above, or tap <strong>Find the closest one</strong>. Each red bubble is how many places pour fountain Diet Coke in that area.</li>';
    $('more').hidden = true;
    return;
  }
  const sorted = [...visible].sort(byCloseness);
  $('nearby-title').textContent = state.me ? 'Closest to you' : 'Closest to the middle of the map';
  const here = visible.filter(inView).length;
  $('nearby-count').textContent = `${here.toLocaleString()} ${state.openOnly ? 'open' : 'places'} in view`;
  const rows = sorted.slice(0, state.shown);
  list.innerHTML = rows.length
    ? rows.map((v) => `
      <li><button type="button" class="row${v.id === state.selected ? ' is-selected' : ''}" data-id="${esc(v.id)}">
        <span class="row-mark k-${v.kind}">${chipHtml(v.chain)}</span>
        <span class="row-main">
          <span class="row-name">${esc(v.name)}${v.kind === 'confirmed' ? ' <span class="tick" aria-label="confirmed">✓</span>' : ''}</span>
          <span class="row-where">${esc(placeLine(v))}</span>
          <span class="row-status"><span class="open-dot ${openClass(v)}"></span>${esc(openText(v))}${v.sum.fizz ? ` · ${fizzHtml(v.sum.fizz)} ${v.sum.fizz}` : ''}${v.kind === 'out' ? ` · <span class="warn">${esc(verdict(v).pill)}</span>` : ''}</span>
        </span>
        <span class="row-dist">${fmtMiles(v.dist)}</span>
      </button></li>`).join('')
    : `<li class="empty">${state.pending.size ? 'Loading places…' : `Nothing here matches${state.openOnly ? ' that\'s open right now' : ''}. Try fewer filters${state.openOnly ? ', or "Open or closed"' : ''}.`}</li>`;
  $('more').hidden = sorted.length <= state.shown;
}

function renderChips() {
  const counts = state.index.chains;
  const keys = Object.keys(CHAINS).filter((k) => counts[k]);
  $('chain-chips').innerHTML = `
    <div class="chip-actions"><button type="button" data-chains="all">All</button><button type="button" data-chains="none">None</button></div>
    ${keys.map((k) => `<button type="button" class="chain-toggle" data-chain="${k}" aria-pressed="${!state.chainsOff.has(k)}">
      ${chipHtml(CHAINS[k])}<span>${esc(CHAINS[k].name)}</span><span class="count">${counts[k].toLocaleString()}</span></button>`).join('')}`;
  const on = keys.filter((k) => !state.chainsOff.has(k)).length;
  $('chains-summary').textContent = on === keys.length ? `all ${keys.length}` : `${on} of ${keys.length}`;
}

function renderHero() {
  $('find').classList.toggle('is-located', !!state.me);
  $('find-sub').textContent = state.me ? 'Updated with your location' : 'Uses your location';
}

function tagsHtml(v) {
  const items = [];
  const pours = POURS[v.chain.pours];
  if (pours && !v.spot) items.push(`<li>${esc(v.chain.confidence === 'high' ? pours.fact : pours.usually)}</li>`);
  if (v.chain.freestyle && FREESTYLE[v.chain.freestyle]) items.push(`<li>${esc(FREESTYLE[v.chain.freestyle])}</li>`);
  for (const [t, n] of Object.entries(v.sum.tags)) {
    if (t === 'freestyle' && v.chain.freestyle === 'most') continue;
    items.push(`<li>${esc(TAGS[t])} <span class="by">· ${n} ${n === 1 ? 'report' : 'reports'}</span></li>`);
  }
  if (v.drive) items.push('<li>Drive-thru</li>');
  if (typeof v.sum.price === 'number') items.push(`<li>Last paid: $${v.sum.price.toFixed(2)}</li>`);
  return items.length ? `<ul class="facts">${items.join('')}</ul>` : '';
}

function reportLine(r) {
  const when = fmtDate(r.created_at.slice(0, 10));
  const what = r.status === 'pouring' ? (r.fizz ? `${fizzHtml(r.fizz)} ${esc(FIZZ[r.fizz])}` : 'Got one') : esc(STATUSES[r.status]);
  return `<li><span class="r-when">${esc(when)}${r.mine ? ' · you' : ''}</span><span class="r-what">${what}</span>${r.note ? `<span class="r-note">“${esc(r.note)}”</span>` : ''}</li>`;
}

function weekHtml(rows) {
  return `<ul class="week">${rows.map((r) => `<li><span>${esc(r.days)}</span><span>${esc(r.hours)}</span></li>`).join('')}</ul>`;
}

function renderPlace(all) {
  const el = $('place');
  const v = all.find((x) => x.id === state.selected);
  if (!v) { el.hidden = true; el.innerHTML = ''; return; }
  const ver = verdict(v);
  const reports = (state.reports.get(v.id) || []).slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
  const query = [v.name, v.address, v.city, v.state].filter(Boolean).join(', ');
  const directions = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.address ? query : `${v.coords[1]},${v.coords[0]}`)}`;
  const week = weekRows(v.hours);
  const driveWeek = weekRows(v.driveHours);
  const sameDrive = driveWeek.length && JSON.stringify(driveWeek) === JSON.stringify(week);
  el.innerHTML = `
    <div class="place-head">
      <button type="button" class="place-close" aria-label="Close">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
      ${chipHtml(v.chain)}
      <h2>${esc(v.name)}</h2>
      <span class="sub">${esc([v.branch, v.address, [v.city, v.state].filter(Boolean).join(', ')].filter(Boolean).join(' · '))}</span>
    </div>
    <div class="place-body">
      <div class="verdict v-${ver.cls}">
        <div class="verdict-top"><span class="pill">${esc(ver.pill)}</span><span class="verdict-note">${esc(ver.note)}</span></div>
        <div class="verdict-fizz">${v.sum.fizz
          ? `${fizzHtml(v.sum.fizz, { size: 'lg' })}<strong>${v.sum.fizz}</strong><span>fizz from ${v.sum.rated} ${v.sum.rated === 1 ? 'rating' : 'ratings'}</span>`
          : `${fizzHtml(0, { size: 'lg' })}<span>No fizz ratings yet. Be the first.</span>`}</div>
      </div>
      ${tagsHtml(v)}
      ${v.chain.note ? `<p class="chain-note">${esc(v.chain.note)}${v.chain.source ? ` <a href="${esc(v.chain.source)}" target="_blank" rel="noopener">Source</a>` : ''}</p>` : ''}
      <div class="hours">
        <div class="open-line"><span class="open-dot ${openClass(v)}"></span>${esc(openText(v))}${week.length ? zoneNote(v) : ''}</div>
        ${week.length ? weekHtml(week) : ''}
        ${driveWeek.length && !sameDrive ? `<p class="drive-head">Drive-thru</p>${weekHtml(driveWeek)}` : ''}
        ${driveWeek.length && sameDrive ? '<p class="drive-head">Drive-thru keeps the same hours</p>' : ''}
      </div>
      <div class="reports">
        <h3>Reports</h3>
        ${reports.length ? `<ul class="report-list">${reports.slice(0, 6).map(reportLine).join('')}</ul>` : '<p class="muted">Nobody has reported on this one yet.</p>'}
        ${reports.length > 6 ? `<p class="muted">and ${reports.length - 6} more</p>` : ''}
      </div>
      <div class="actions">
        <button type="button" class="primary" data-log-here>Log a Diet Coke here</button>
        <a class="secondary" href="${esc(directions)}" target="_blank" rel="noopener">Directions</a>
        ${v.phone ? `<a class="secondary narrow" href="tel:${esc(v.phone.replace(/[^\d+]/g, ''))}" aria-label="Call">Call</a>` : ''}
      </div>
      <p class="source">${v.spot
        ? `Added by ${v.localOnly ? 'you, on this device' : 'a visitor'}${v.addedAt ? ` on ${esc(fmtDate(v.addedAt.slice(0, 10)))}` : ''}.`
        : `Location and hours from ${v.website ? `<a href="${esc(v.website)}" target="_blank" rel="noopener">the ${esc(v.name)} store locator</a>` : `the ${esc(v.name)} store locator`}${state.index.updated ? `, checked ${esc(fmtDate(state.index.updated))}` : ''}.`}</p>
    </div>`;
  el.hidden = false;
}

function renderLogCount() {
  $('log-count').textContent = state.log.filter((e) => e.status === 'pouring').length;
}

// ---------- Map ----------

let map;
let mapReady = false;
let geolocate;

function placeFeatures(list) {
  return {
    type: 'FeatureCollection',
    features: list.map((v) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: v.coords },
      properties: {
        id: v.id,
        kind: v.kind,
        closed: v.open === false,
        order: (v.open === false ? 0 : 10) + (2 - KIND_RANK[v.kind]),
        label: v.sum.fizz ? `${v.name}  ${v.sum.fizz}` : v.name
      }
    }))
  };
}

function squareFeatures() {
  return {
    type: 'FeatureCollection',
    features: [...state.index.cells].map(([id, c]) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
      properties: { id, count: c.count, label: c.count >= 1000 ? `${(c.count / 1000).toFixed(1)}k` : String(c.count) }
    }))
  };
}

function renderMap(visible) {
  if (!mapReady) return;
  map.getSource('places').setData(placeFeatures(visible));
  map.setFilter('place-halo', ['==', ['get', 'id'], state.selected || '']);
}

function savedView() {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY) || 'null');
    return v && Array.isArray(v.center) && typeof v.zoom === 'number' ? v : null;
  } catch {
    return null;
  }
}

function saveView() {
  try { localStorage.setItem(VIEW_KEY, JSON.stringify({ center: map.getCenter().toArray(), zoom: map.getZoom() })); } catch { /* fine */ }
}

// Loads what's on screen once zoomed in far enough, and keeps the list in step.
async function onMove() {
  const b = map.getBounds();
  state.bounds = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
  const c = map.getCenter();
  state.center = [c.lng, c.lat];
  state.detail = map.getZoom() >= DETAIL_ZOOM - 0.01;
  saveView();
  if (state.detail) {
    const ids = cellsIn(state.bounds).filter((id) => state.index.cells.has(id));
    if (ids.some((id) => !state.cells.has(id))) {
      renderList(view().visible);
      await loadCells(ids);
      render();
      return;
    }
  }
  renderList(view().visible);
}

function setupMap() {
  const start = location.hash ? null : savedView();
  map = new maplibregl.Map({
    container: 'map',
    style: 'https://tiles.openfreemap.org/styles/positron',
    ...(start ? { center: start.center, zoom: start.zoom } : { bounds: US_BOUNDS, fitBoundsOptions: { padding: 12 } }),
    minZoom: 2,
    hash: true,
    attributionControl: { compact: true }
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  geolocate = new maplibregl.GeolocateControl({ trackUserLocation: false, fitBoundsOptions: { maxZoom: 13 } });
  map.addControl(geolocate, 'top-right');
  geolocate.on('geolocate', (e) => located([e.coords.longitude, e.coords.latitude]));
  geolocate.on('error', () => locateFailed());

  map.on('load', () => {
    // Zoomed out: one bubble per square, sized by how many places it has.
    map.addSource('squares', { type: 'geojson', data: squareFeatures() });
    const sq = ['sqrt', ['get', 'count']];
    map.addLayer({
      id: 'square-dot', type: 'circle', source: 'squares', maxzoom: DETAIL_ZOOM,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, ['+', 1.2, ['*', 0.28, sq]], 6, ['+', 2.5, ['*', 0.6, sq]], 9, ['+', 4, ['*', 1.1, sq]]],
        'circle-color': '#D7182A',
        'circle-opacity': 0.72,
        'circle-stroke-color': '#FFFFFF',
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 3, 0.4, 8, 1.2]
      }
    });
    map.addLayer({
      id: 'square-count', type: 'symbol', source: 'squares', minzoom: 6.5, maxzoom: DETAIL_ZOOM,
      filter: ['>=', ['get', 'count'], 5],
      layout: { 'text-field': ['get', 'label'], 'text-font': ['Noto Sans Bold'], 'text-size': 11 },
      paint: { 'text-color': '#FFFFFF' }
    });

    // Zoomed in: each place.
    map.addSource('places', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    const r = (n) => ['match', ['get', 'kind'], 'confirmed', n * 1.3, n];
    map.addLayer({
      id: 'place-halo', type: 'circle', source: 'places', minzoom: DETAIL_ZOOM, filter: ['==', ['get', 'id'], ''],
      paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 10, 15, 20], 'circle-color': '#D7182A', 'circle-opacity': 0.22, 'circle-stroke-width': 2, 'circle-stroke-color': '#D7182A' }
    });
    map.addLayer({
      id: 'place-dot', type: 'circle', source: 'places', minzoom: DETAIL_ZOOM,
      layout: { 'circle-sort-key': ['get', 'order'] },
      paint: {
        // Confirmed places are drawn a little bigger.
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, r(2.8), 12, r(4.6), 15, r(8), 17, r(11)],
        'circle-color': ['match', ['get', 'kind'], 'confirmed', '#D7182A', 'out', '#9AA0A8', '#FFFFFF'],
        'circle-stroke-color': ['match', ['get', 'kind'], 'confirmed', '#FFFFFF', 'out', '#FFFFFF', '#1A1A1A'],
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 9, 1, 14, 2],
        'circle-opacity': ['case', ['get', 'closed'], 0.45, 1],
        'circle-stroke-opacity': ['case', ['get', 'closed'], 0.45, 1]
      }
    });
    map.addLayer({
      id: 'place-label', type: 'symbol', source: 'places', minzoom: 13.5,
      layout: {
        'text-field': ['get', 'label'],
        'text-font': ['Noto Sans Bold'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 13.5, 11, 17, 13],
        'text-offset': [0, 1.1],
        'text-anchor': 'top',
        'symbol-sort-key': ['-', 20, ['get', 'order']]
      },
      paint: { 'text-color': ['case', ['get', 'closed'], '#7A7F87', '#141414'], 'text-halo-color': '#FFFFFF', 'text-halo-width': 1.6 }
    });

    // Small dots are hard to hit on a phone, so take the nearest within a few pixels.
    map.on('click', (e) => {
      if (state.picking) { finishPick([e.lngLat.lng, e.lngLat.lat]); return; }
      const box = (pad) => [[e.point.x - pad, e.point.y - pad], [e.point.x + pad, e.point.y + pad]];
      if (map.getZoom() < DETAIL_ZOOM) {
        const hit = map.queryRenderedFeatures(box(6), { layers: ['square-dot'] })[0];
        if (hit) map.flyTo({ center: hit.geometry.coordinates, zoom: DETAIL_ZOOM + 1.6 });
        return;
      }
      const hits = map.queryRenderedFeatures(box(10), { layers: ['place-dot'] });
      if (!hits.length) return;
      const near = hits.map((f) => ({ f, d: map.project(f.geometry.coordinates).dist(e.point) })).sort((a, b) => a.d - b.d)[0].f;
      select(near.properties.id, false);
    });
    map.on('mousemove', (e) => {
      if (state.picking) { map.getCanvas().style.cursor = 'crosshair'; return; }
      const layers = map.getZoom() < DETAIL_ZOOM ? ['square-dot'] : ['place-dot'];
      const hit = map.queryRenderedFeatures([[e.point.x - 6, e.point.y - 6], [e.point.x + 6, e.point.y + 6]], { layers }).length;
      map.getCanvas().style.cursor = hit ? 'pointer' : '';
    });
    map.on('moveend', onMove);
    mapReady = true;
    onMove().then(render);
  });
}

// ---------- Finding the closest one ----------

let wantClosest = false;

// Looks outward from you a ring of squares at a time. Each ring reaches at
// least about 20 miles further in every direction, so once the best so far is
// closer than that, nothing not yet loaded can beat it.
async function nearestOpen(coords) {
  let best = null;
  for (let rings = 1; rings <= 4; rings++) {
    await loadCells(cellsAround(coords[0], coords[1], rings).filter((id) => state.index.cells.has(id)));
    best = closestOpen(view().visible);
    if (best && best.dist <= rings * 20) return best;
  }
  return best;
}

async function located(coords) {
  state.me = coords;
  state.shown = PAGE;
  if (!wantClosest) { render(); return; }
  wantClosest = false;
  $('hero-note').textContent = 'Looking around you…';
  const open = await nearestOpen(coords);
  if (open) {
    state.selected = open.id;
    $('hero-note').innerHTML = `Closest open: <strong>${esc(open.name)}</strong>, ${fmtMiles(open.dist)} away. ${esc(openText(open))}.`;
    const b = new maplibregl.LngLatBounds(coords, coords).extend(open.coords);
    map.fitBounds(b, { padding: MOBILE.matches ? 60 : 120, maxZoom: 15.5, minZoom: DETAIL_ZOOM, duration: 900 });
    if (MOBILE.matches) setTimeout(() => $('place').scrollIntoView({ behavior: 'smooth', block: 'start' }), 950);
  } else {
    $('hero-note').textContent = 'Nothing open within about 80 miles matches your filters. Try "Open or closed" or fewer filters.';
  }
  render();
}

function locateFailed() {
  wantClosest = false;
  $('hero-note').textContent = 'Couldn\'t get your location. Search for a city or ZIP instead, or zoom in on the map: the list shows what\'s closest to the middle.';
}

function findClosest() {
  wantClosest = true;
  $('hero-note').textContent = 'Finding you…';
  if (!navigator.geolocation) { locateFailed(); return; }
  if (mapReady) geolocate.trigger();
  else navigator.geolocation.getCurrentPosition((p) => located([p.coords.longitude, p.coords.latitude]), locateFailed, { timeout: 10000 });
}

// ---------- Searching for a place ----------

// Uses OpenStreetMap's Nominatim, one search per submit as its rules ask.
async function search(q) {
  const out = $('search-results');
  out.hidden = false;
  out.innerHTML = '<li class="sr-note">Searching…</li>';
  let results = [];
  try {
    const url = `${NOMINATIM}?${new URLSearchParams({ q, format: 'jsonv2', countrycodes: 'us', limit: '5' })}`;
    results = await (await fetch(url, { headers: { Accept: 'application/json' } })).json();
  } catch {
    out.innerHTML = '<li class="sr-note">Search isn\'t working right now. Try zooming the map instead.</li>';
    return;
  }
  if (!results.length) { out.innerHTML = '<li class="sr-note">No US place by that name. Try a city, ZIP or street address.</li>'; return; }
  // Go straight to the best match, and offer the others in case it's the wrong Springfield.
  goTo(results[0]);
  if (results.length === 1) return;
  out.hidden = false;
  out.innerHTML = '<li class="sr-note">Not this one?</li>'
    + results.slice(1).map((r, i) => `<li><button type="button" data-result="${i + 1}">${esc(r.display_name.replace(/, United States$/, ''))}</button></li>`).join('')
    + '<li class="sr-note">Search by <a href="https://nominatim.openstreetmap.org" target="_blank" rel="noopener">OpenStreetMap</a></li>';
  out.onclick = (e) => {
    const b = e.target.closest('[data-result]');
    if (b) goTo(results[Number(b.dataset.result)]);
  };
}

function goTo(r) {
  $('search-results').hidden = true;
  $('search').blur();
  const [s, n, w, e] = (r.boundingbox || []).map(Number);
  const pinpoint = ['house', 'building', 'amenity', 'shop'].includes(r.category) || ['road', 'house', 'building'].includes(r.addresstype);
  if (!pinpoint && [s, n, w, e].every(Number.isFinite)) {
    // Whole states stay zoomed out; towns and ZIPs come in close enough to show places.
    map.fitBounds([[w, s], [e, n]], { padding: 30, maxZoom: 13, minZoom: r.addresstype === 'state' ? 0 : DETAIL_ZOOM + 0.5 });
  } else {
    map.flyTo({ center: [Number(r.lon), Number(r.lat)], zoom: 14.5 });
  }
  if (MOBILE.matches) $('map').scrollIntoView({ behavior: 'smooth' });
}

// ---------- Adding a spot ----------

function startPick() {
  state.picking = true;
  state.selected = null;
  $('pick-banner').hidden = false;
  document.body.classList.add('is-picking');
  if (MOBILE.matches) $('map').scrollIntoView({ behavior: 'smooth' });
  render();
}

function stopPick() {
  state.picking = false;
  $('pick-banner').hidden = true;
  document.body.classList.remove('is-picking');
  if (mapReady) map.getCanvas().style.cursor = '';
}

function finishPick(lngLat) {
  stopPick();
  openAddSpot(lngLat, saved);
}

// ---------- Interaction ----------

function select(id, fly = true) {
  state.selected = id;
  render();
  const v = allPlaces().find((x) => x.id === id);
  if (v && fly && mapReady) map.flyTo({ center: v.coords, zoom: Math.max(map.getZoom(), 14.5) });
  if (v && MOBILE.matches) $('place').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function render() {
  const { all, visible } = view();
  renderHero();
  renderList(visible);
  renderPlace(all);
  renderMap(visible);
  renderLogCount();
  $('show-open').setAttribute('aria-pressed', String(state.openOnly));
  $('show-all').setAttribute('aria-pressed', String(!state.openOnly));
}

// A report or a new spot was just saved.
function saved() {
  state.log = readLog();
  rebuildReports();
  render();
}

function setupControls() {
  $('find').addEventListener('click', findClosest);
  $('search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = $('search').value.trim();
    if (q.length >= 2) search(q);
  });
  $('search').addEventListener('input', () => { if (!$('search').value) $('search-results').hidden = true; });
  document.addEventListener('click', (e) => { if (!e.target.closest('.search')) $('search-results').hidden = true; });
  $('show-open').addEventListener('click', () => { state.openOnly = true; render(); });
  $('show-all').addEventListener('click', () => { state.openOnly = false; render(); });
  document.querySelector('.toggles').addEventListener('click', (e) => {
    const b = e.target.closest('[data-filter]');
    if (!b) return;
    const k = b.dataset.filter;
    if (state.filters.has(k)) state.filters.delete(k); else state.filters.add(k);
    b.setAttribute('aria-pressed', String(state.filters.has(k)));
    state.shown = PAGE;
    render();
  });
  $('chain-chips').addEventListener('click', (e) => {
    const all = e.target.closest('[data-chains]');
    if (all) {
      state.chainsOff = all.dataset.chains === 'none' ? new Set(Object.keys(CHAINS)) : new Set();
    } else {
      const b = e.target.closest('[data-chain]');
      if (!b) return;
      const k = b.dataset.chain;
      if (state.chainsOff.has(k)) state.chainsOff.delete(k); else state.chainsOff.add(k);
    }
    renderChips();
    render();
  });
  $('nearby').addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (b) select(b.dataset.id);
  });
  $('more').addEventListener('click', () => { state.shown += PAGE; renderList(view().visible); });
  $('place').addEventListener('click', (e) => {
    if (e.target.closest('.place-close')) { state.selected = null; render(); return; }
    const v = view().all.find((x) => x.id === state.selected);
    if (v && e.target.closest('[data-log-here]')) openReport(v, saved);
  });
  $('open-log').addEventListener('click', () => openLog(allPlaces(), (id) => { if (id) select(id); else saved(); }));
  $('add-spot').addEventListener('click', startPick);
  $('pick-cancel').addEventListener('click', () => { stopPick(); render(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.picking) { stopPick(); render(); } });
  setInterval(() => { state.clocks.clear(); render(); }, 60 * 1000);
}

function renderStatic() {
  const link = (c) => `<a href="${esc(c.source)}" target="_blank" rel="noopener">${esc(c.name)}</a>${c.why ? ` (${esc(c.why)})` : ''}`;
  const pepsi = NOT_HERE.filter((c) => !c.none);
  const none = NOT_HERE.filter((c) => c.none);
  $('pepsi-note').innerHTML = `Not on the map because they pour Pepsi: ${pepsi.map(link).join(', ')}. No fountain soda at all: ${none.map((c) => `${link(c)} (${esc(c.none)})`).join(', ')}.`;
  $('data-updated').textContent = state.index.updated ? `Locations checked ${fmtDate(state.index.updated)}.` : '';
}

async function main() {
  setupControls();
  state.log = readLog();
  const [, shared] = await Promise.all([loadIndex(), fetchShared()]);
  state.shared = shared;
  rebuildReports();
  renderStatic();
  renderChips();
  setupMap();
  render();
}

main();
