import { nowInDC, fmtDate, fmtAge, daysSince } from '../../js/time.js';
import { parseHours, openAt, openNote, weekRows } from './hours.js';
import { CHAINS, SPOT, POURS, FREESTYLE, NOT_HERE } from './chains.js';
import { FIZZ, TAGS, STATUSES, summarize } from './report-model.js';
import { sharing, fetchShared, readLog } from './reports.js';
import { openReport, openAddSpot, openLog } from './dialogs.js';
import { esc, fizzHtml, chipHtml, fmtMiles } from './ui.js';

const PAGE = 15;
const DC = [-77.0365, 38.8977];
const MOBILE = window.matchMedia('(max-width: 820px)');
const KIND_RANK = { confirmed: 0, likely: 1, out: 2 };

const state = {
  places: [],
  shared: { reports: [], places: [] },
  log: [],
  summaries: new Map(),
  reports: new Map(),
  moment: nowInDC(),
  openOnly: true,
  filters: new Set(),
  chainsOff: new Set(),
  query: '',
  selected: null,
  me: null,
  center: DC,
  shown: PAGE,
  picking: false,
  updated: ''
};

const $ = (id) => document.getElementById(id);

// ---------- Data ----------

function fromFeature(f) {
  const p = f.properties || {};
  const chain = CHAINS[p.chain];
  if (!chain || !f.geometry) return null;
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
    drive: p.drive_through === true || !!p.drive_hours,
    coords: f.geometry.coordinates.map(Number),
    search: [chain.name, chain.short, p.branch, p.address, p.city, p.state, p.postcode].join(' ').toLowerCase()
  };
}

// A spot a visitor added: shared ones from the server, or ones in your own log.
function fromSpot(s) {
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
    coords: [Number(s.lng), Number(s.lat)],
    search: `${s.name} ${s.address || ''} local spot`.toLowerCase()
  };
}

async function loadPlaces() {
  try {
    const res = await fetch('data/places.geojson', { cache: 'no-cache' });
    const fc = await res.json();
    state.updated = fc.updated || '';
    return (fc.features || []).map(fromFeature).filter(Boolean);
  } catch {
    return [];
  }
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

function allPlaces() {
  const spots = new Map();
  for (const s of state.shared.places) spots.set(s.id, fromSpot(s));
  for (const e of state.log) {
    if (e.spot && !spots.has(e.place_id)) spots.set(e.place_id, fromSpot({ ...e.spot, id: e.place_id, localOnly: !sharing() || !e.shared_id, created_at: e.created_at }));
  }
  return [...state.places, ...spots.values()];
}

// ---------- Derived view ----------

const EMPTY = summarize([]);

function miles([lng1, lat1], [lng2, lat2]) {
  const r = (d) => (d * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(a));
}

function decorate(p, from) {
  const lobby = openAt(p.hours, state.moment);
  const drive = p.driveHours ? openAt(p.driveHours, state.moment) : null;
  let open = null;
  if (!lobby.unknown) open = lobby.open;
  if (drive && !drive.unknown) open = open || drive.open;
  const sum = state.summaries.get(p.id) || EMPTY;
  return {
    ...p,
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
  if (state.query && !v.search.includes(state.query)) return false;
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

// ---------- Small pieces ----------

function placeLine(v) {
  const where = [v.branch, v.address].filter(Boolean).join(' · ');
  return where || [v.city, v.state].filter(Boolean).join(', ');
}

function openClass(v) {
  if (v.open === null) return 'unknown';
  if (!v.open) return 'closed';
  const left = Math.min(v.lobby.open ? v.lobby.minsLeft ?? Infinity : Infinity, v.driveSt?.open ? v.driveSt.minsLeft ?? Infinity : Infinity);
  return left <= 60 && !v.always ? 'soon' : 'open';
}

function openText(v) {
  const drive = () => `Drive-thru ${openNote(v.driveSt, state.moment).replace(/^./, (c) => c.toLowerCase())}`;
  // When the lobby is closed (or its hours unknown) the drive-thru may still be serving.
  if (v.driveSt && !v.driveSt.unknown && (v.lobby.unknown || (!v.lobby.open && v.driveSt.open))) return drive();
  if (v.lobby.unknown) return 'Hours not listed';
  return openNote(v.lobby, state.moment);
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
  const list = [...visible].sort(byCloseness);
  $('nearby-title').textContent = state.me ? 'Closest to you' : 'Closest to the middle of the map';
  $('nearby-count').textContent = `${visible.length.toLocaleString()} ${state.openOnly ? 'open now' : 'places'}`;
  const rows = list.slice(0, state.shown);
  $('nearby').innerHTML = rows.length
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
    : `<li class="empty">Nothing matches${state.openOnly ? ' that\'s open right now' : ''}. Try fewer filters${state.openOnly ? ', or "Open or closed"' : ''}.</li>`;
  $('more').hidden = list.length <= state.shown;
}

function renderChips(all) {
  const counts = new Map();
  for (const v of all) counts.set(v.chainKey, (counts.get(v.chainKey) || 0) + 1);
  const keys = Object.keys(CHAINS).filter((k) => counts.get(k));
  $('chain-chips').innerHTML = `
    <div class="chip-actions"><button type="button" data-chains="all">All</button><button type="button" data-chains="none">None</button></div>
    ${keys.map((k) => `<button type="button" class="chain-toggle" data-chain="${k}" aria-pressed="${!state.chainsOff.has(k)}">
      ${chipHtml(CHAINS[k])}<span>${esc(CHAINS[k].name)}</span><span class="count">${counts.get(k)}</span></button>`).join('')}`;
  const on = keys.filter((k) => !state.chainsOff.has(k)).length;
  $('chains-summary').textContent = on === keys.length ? `all ${keys.length}` : `${on} of ${keys.length}`;
}

function renderHero() {
  const btn = $('find');
  btn.classList.toggle('is-located', !!state.me);
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
        <div class="open-line"><span class="open-dot ${openClass(v)}"></span>${esc(openText(v))}</div>
        ${week.length ? `<ul class="week">${week.map((r) => `<li><span>${esc(r.days)}</span><span>${esc(r.hours)}</span></li>`).join('')}</ul>` : ''}
        ${driveWeek.length && !sameDrive ? `<p class="drive-head">Drive-thru</p><ul class="week">${driveWeek.map((r) => `<li><span>${esc(r.days)}</span><span>${esc(r.hours)}</span></li>`).join('')}</ul>` : ''}
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
        : `Location and hours from ${v.website ? `<a href="${esc(v.website)}" target="_blank" rel="noopener">the ${esc(v.name)} store locator</a>` : `the ${esc(v.name)} store locator`}${state.updated ? `, checked ${esc(fmtDate(state.updated))}` : ''}.`}</p>
    </div>`;
  el.hidden = false;
}

function renderLogCount() {
  const n = state.log.filter((e) => e.status === 'pouring').length;
  $('log-count').textContent = n;
}

// ---------- Map ----------

let map;
let mapReady = false;
let geolocate;

function features(list) {
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

function renderMap(visible) {
  if (!mapReady) return;
  map.getSource('places').setData(features(visible));
  map.setFilter('place-halo', ['==', ['get', 'id'], state.selected || '']);
}

function setupMap() {
  map = new maplibregl.Map({
    container: 'map',
    style: 'https://tiles.openfreemap.org/styles/positron',
    center: DC,
    zoom: MOBILE.matches ? 9.6 : 10.4,
    minZoom: 8.5,
    maxBounds: [[-78.3, 38.25], [-76.0, 39.6]],
    attributionControl: { compact: true }
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  geolocate = new maplibregl.GeolocateControl({ trackUserLocation: false, fitBoundsOptions: { maxZoom: 14 } });
  map.addControl(geolocate, 'top-right');
  geolocate.on('geolocate', (e) => located([e.coords.longitude, e.coords.latitude]));
  geolocate.on('error', () => locateFailed());

  map.on('load', () => {
    map.addSource('places', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    // Confirmed places are drawn a little bigger.
    const r = (n) => ['match', ['get', 'kind'], 'confirmed', n * 1.3, n];
    const radius = ['interpolate', ['linear'], ['zoom'], 9, r(2.6), 12, r(4.6), 15, r(8), 17, r(11)];
    map.addLayer({
      id: 'place-halo', type: 'circle', source: 'places', filter: ['==', ['get', 'id'], ''],
      paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 10, 15, 20], 'circle-color': '#D7182A', 'circle-opacity': 0.22, 'circle-stroke-width': 2, 'circle-stroke-color': '#D7182A' }
    });
    map.addLayer({
      id: 'place-dot', type: 'circle', source: 'places',
      layout: { 'circle-sort-key': ['get', 'order'] },
      paint: {
        'circle-radius': radius,
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
      const pad = 10;
      const hits = map.queryRenderedFeatures([[e.point.x - pad, e.point.y - pad], [e.point.x + pad, e.point.y + pad]], { layers: ['place-dot'] });
      if (!hits.length) return;
      const near = hits.map((f) => ({ f, d: map.project(f.geometry.coordinates).dist(e.point) })).sort((a, b) => a.d - b.d)[0].f;
      select(near.properties.id, false);
    });
    map.on('mousemove', (e) => {
      if (state.picking) { map.getCanvas().style.cursor = 'crosshair'; return; }
      const hit = map.queryRenderedFeatures([[e.point.x - 6, e.point.y - 6], [e.point.x + 6, e.point.y + 6]], { layers: ['place-dot'] }).length;
      map.getCanvas().style.cursor = hit ? 'pointer' : '';
    });
    map.on('moveend', () => {
      const c = map.getCenter();
      state.center = [c.lng, c.lat];
      if (!state.me) renderListOnly();
    });
    mapReady = true;
    render();
  });
}

// ---------- Finding the closest one ----------

let wantClosest = false;

function located(coords) {
  state.me = coords;
  state.shown = PAGE;
  if (wantClosest) {
    wantClosest = false;
    const { visible } = view();
    const open = closestOpen(visible);
    if (open) {
      state.selected = open.id;
      $('hero-note').innerHTML = `Closest open: <strong>${esc(open.name)}</strong>, ${fmtMiles(open.dist)} away. ${esc(openText(open))}.`;
      const b = new maplibregl.LngLatBounds(coords, coords).extend(open.coords);
      map.fitBounds(b, { padding: MOBILE.matches ? 60 : 120, maxZoom: 15.5, duration: 900 });
      if (MOBILE.matches) setTimeout(() => $('place').scrollIntoView({ behavior: 'smooth', block: 'start' }), 950);
    } else {
      $('hero-note').textContent = 'Nothing open matches your filters near you. Try "Open or closed" or fewer filters.';
    }
  }
  render();
}

function locateFailed() {
  wantClosest = false;
  $('hero-note').textContent = 'Couldn\'t get your location. Search a street, city or ZIP instead, or move the map: the list shows what\'s closest to the middle.';
}

function findClosest() {
  wantClosest = true;
  $('hero-note').textContent = 'Finding you…';
  if (!navigator.geolocation) { locateFailed(); return; }
  if (mapReady) geolocate.trigger();
  else navigator.geolocation.getCurrentPosition((p) => located([p.coords.longitude, p.coords.latitude]), locateFailed, { timeout: 10000 });
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

function renderListOnly() {
  renderList(view().visible);
}

function render() {
  const { all, visible } = view();
  renderHero();
  renderList(visible);
  renderChips(all);
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
  $('search').addEventListener('input', (e) => { state.query = e.target.value.trim().toLowerCase(); state.shown = PAGE; render(); });
  $('search').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !state.query) return;
    // Enter jumps the map to what matched.
    const { visible } = view();
    if (!visible.length || !mapReady) return;
    const b = new maplibregl.LngLatBounds(visible[0].coords, visible[0].coords);
    for (const v of visible) b.extend(v.coords);
    map.fitBounds(b, { padding: 60, maxZoom: 14.5 });
  });
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
      render();
      return;
    }
    const b = e.target.closest('[data-chain]');
    if (!b) return;
    const k = b.dataset.chain;
    if (state.chainsOff.has(k)) state.chainsOff.delete(k); else state.chainsOff.add(k);
    render();
  });
  $('nearby').addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (b) select(b.dataset.id);
  });
  $('more').addEventListener('click', () => { state.shown += PAGE; renderListOnly(); });
  $('place').addEventListener('click', (e) => {
    if (e.target.closest('.place-close')) { state.selected = null; render(); return; }
    const v = view().all.find((x) => x.id === state.selected);
    if (v && e.target.closest('[data-log-here]')) openReport(v, saved);
  });
  $('open-log').addEventListener('click', () => openLog(allPlaces(), (id) => { if (id) select(id); else saved(); }));
  $('add-spot').addEventListener('click', startPick);
  $('pick-cancel').addEventListener('click', () => { stopPick(); render(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.picking) { stopPick(); render(); } });
  setInterval(() => { state.moment = nowInDC(); render(); }, 60 * 1000);
}

function renderStatic() {
  $('pepsi-note').innerHTML = `Not on the map, because there's no fountain Diet Coke: ${NOT_HERE.map((c) => `<a href="${esc(c.source)}" target="_blank" rel="noopener">${esc(c.name)}</a> (${esc(c.why)})`).join(', ')}.`;
  $('data-updated').textContent = state.updated ? `Locations checked ${fmtDate(state.updated)}.` : '';
}

async function main() {
  setupControls();
  setupMap();
  state.log = readLog();
  const [places, shared] = await Promise.all([loadPlaces(), fetchShared()]);
  state.places = places;
  state.shared = shared;
  rebuildReports();
  renderStatic();
  render();
}

main();
