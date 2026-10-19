import { DAYS, DAY_LABELS, statusAt, nowInDC, fmtClock, fmtDuration, fmtDays, fmtWindowTime, toMin, fmtDate, daysSince, fmtAge } from './time.js';
import { LINES, LINE_ORDER, linesFor } from './lines.js';

const REPO = 'tobinjstone/dc-happy-hour-map';
const DRINKS = new Set(['beer', 'wine', 'cocktail', 'spirits']);
const CAT_LABEL = { beer: 'Beer', wine: 'Wine', cocktail: 'Cocktail', spirits: 'Rail', food: 'Food', other: 'Other' };
const STATUS_LABEL = { live: 'Pouring now', soon: 'Arriving', later: 'Later today', ended: 'Done today', off: 'Not today' };
const STALE_DAYS = 60;
const RANK = { live: 0, soon: 1, later: 2, ended: 3, off: 4 };
const TYPE_LABEL = { bar: 'Bar', nightclub: 'Nightclub', restaurant: 'Restaurant', hotel: 'Hotel bar', multipurpose: 'Venue', arena: 'Arena' };

const state = {
  venues: [],
  sample: false,
  followNow: true,
  moment: nowInDC(),
  off: new Set(),
  liveOnly: false,
  foodOnly: false,
  query: '',
  selected: null
};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- Data ----------

async function loadData() {
  for (const url of ['data/happy_hours.geojson', 'data/sample.geojson']) {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) continue;
      const fc = await res.json();
      const venues = (fc.features || []).map(normalize).filter(Boolean);
      if (!venues.length) continue;
      const dates = venues.map((v) => v.verified).filter(Boolean).sort();
      return { venues, sample: url.includes('sample') || !!fc.sample, updated: fc.updated || dates[dates.length - 1] || '' };
    } catch (e) {
      // Try the next file.
    }
  }
  return { venues: [], sample: false };
}

function parseMaybe(v) {
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return null; }
}

function normalize(f) {
  const raw = f.properties || {};
  // The crawl flattens happy hour fields with an hh_ prefix; accept either form.
  const p = new Proxy(raw, { get: (o, k) => o[`hh_${String(k)}`] ?? o[k] });
  const windows = parseMaybe(p.windows) || [];
  const deals = parseMaybe(p.deals) || [];
  const coords = f.geometry && f.geometry.coordinates;
  if (!coords || !windows.length) return null;
  if (p.status && p.status !== 'has_happy_hour') return null;
  const v = {
    id: String(p.venue_id || p.id),
    name: p.name || 'Unnamed bar',
    neighborhood: p.neighborhood || '',
    type: TYPE_LABEL[p.venue_type] || p.venue_type || '',
    coords: [Number(coords[0]), Number(coords[1])],
    windows,
    deals,
    sourceUrl: p.source_url || '',
    verified: p.last_verified || '',
    sourceDate: p.source_date || '',
    sample: !!p.sample
  };
  v.lines = linesFor(v);
  v.hasFood = deals.some((d) => d.category === 'food');
  v.price = cheapestDrink(deals);
  v.search = `${v.name} ${v.neighborhood}`.toLowerCase();
  return v;
}

function cheapestDrink(deals) {
  const prices = deals
    .filter((d) => DRINKS.has(d.category) && typeof d.price === 'number' && (!d.kind || d.kind === 'flat_price'))
    .map((d) => d.price);
  return prices.length ? Math.min(...prices) : null;
}

// ---------- Derived view ----------

function withStatus() {
  return state.venues.map((v) => ({ ...v, st: statusAt(v.windows, state.moment) }));
}

function isVisible(v) {
  if (state.liveOnly && v.st.status !== 'live') return false;
  if (state.foodOnly && !v.hasFood) return false;
  if (state.query && !v.search.includes(state.query)) return false;
  if (v.lines.length && v.lines.every((k) => state.off.has(k))) return false;
  return true;
}

function money(n) {
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}

function dealPrice(d) {
  const p = d.price;
  switch (d.kind) {
    case 'half_off': return 'Half off';
    case 'dollars_off': return typeof p === 'number' ? `${money(p)} off` : 'Discount';
    case 'percent_off': return typeof p === 'number' ? `${p}% off` : 'Discount';
    case 'bogo': return 'BOGO';
    case 'free': return 'Free';
    default: return typeof p === 'number' ? money(p) : '';
  }
}

function windowEnd(w) {
  return w.end ? fmtClock(toMin(w.end)) : (w.end_label || 'close');
}

function statusNote(st) {
  switch (st.status) {
    case 'live': return `Ends ${windowEnd(st.window)}, ${fmtDuration(st.minsLeft)} left`;
    case 'soon': return `Starts ${fmtClock(toMin(st.window.start))}, in ${fmtDuration(st.minsUntil)}`;
    case 'later': return `Starts ${fmtClock(toMin(st.window.start))}`;
    case 'ended': return 'Done for today';
    default: return `No happy hour on ${DAY_LABELS[state.moment.day]}`;
  }
}

function boardTime(st) {
  if (st.status === 'live') return `${st.minsLeft} LEFT`;
  if (st.status === 'soon') return `ARR ${st.minsUntil}`;
  if (st.status === 'later') return fmtClock(toMin(st.window.start)).replace(' ', '').toUpperCase();
  return 'DONE';
}

function bulletHtml(key) {
  const l = LINES[key];
  return `<span class="bullet" style="background:${l.color};color:${l.text}" aria-label="${l.label} line">${l.letter}</span>`;
}

// ---------- Rendering ----------

function renderClock() {
  $('clock').textContent = `${DAY_LABELS[state.moment.day].toUpperCase()} ${fmtClock(state.moment.min).replace(' ', '').toUpperCase()}`;
  $('day').value = state.moment.day;
  const h = Math.floor(state.moment.min / 60);
  const m = state.moment.min % 60;
  $('time').value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  $('now').setAttribute('aria-pressed', String(state.followNow));
}

function renderBoard(list) {
  const rows = list
    .filter((v) => v.st.status !== 'off')
    .sort((a, b) => RANK[a.st.status] - RANK[b.st.status] ||
      (a.st.minsLeft ?? a.st.minsUntil ?? 0) - (b.st.minsLeft ?? b.st.minsUntil ?? 0))
    .slice(0, 8);
  const ol = $('board');
  if (!rows.length) {
    ol.innerHTML = `<li class="board-empty">NO HAPPY HOURS ${state.followNow ? 'TODAY' : 'AT THIS TIME'}</li>`;
    return;
  }
  ol.innerHTML = rows.map((v) => `
    <li><button type="button" class="board-row${v.id === state.selected ? ' is-selected' : ''}${v.st.status === 'ended' ? ' is-dim' : ''}" data-id="${esc(v.id)}">
      <span class="dots">${v.lines.map((k) => `<span class="dot" style="background:${LINES[k].color}"></span>`).join('')}</span>
      <span class="n">${esc(v.name.toUpperCase())}</span>
      <span class="t">${boardTime(v.st)}</span>
    </button></li>`).join('');
}

function renderChips(list) {
  $('line-chips').innerHTML = LINE_ORDER.map((k) => {
    const l = LINES[k];
    const on = !state.off.has(k);
    const n = list.filter((v) => v.lines.includes(k) && v.st.status === 'live').length;
    return `<button type="button" class="line-chip" data-line="${k}" aria-pressed="${on}">
      <span class="bullet" style="background:${l.color};color:${l.text}">${l.letter}</span>${l.label}
      <span class="count">${n} now</span></button>`;
  }).join('');
}

function renderStation(list) {
  const el = $('station');
  const v = list.find((x) => x.id === state.selected);
  $('station-hint').hidden = !!v;
  if (!v) { el.hidden = true; el.innerHTML = ''; return; }
  const [lng, lat] = v.coords;
  const issue = `https://github.com/${REPO}/issues/new?` + new URLSearchParams({
    title: `Happy hour change: ${v.name}`,
    body: `Bar: ${v.name} (${v.id})\nWhat's changed:\n\nWhere you saw it (link or "I was there"):\n`
  });
  let host = '';
  try { host = v.sourceUrl ? new URL(v.sourceUrl).hostname.replace(/^www\./, '') : ''; } catch { host = ''; }
  const sourceDated = v.sourceDate ? `, dated ${esc(fmtDate(v.sourceDate))}` : '';
  const source = v.sample
    ? 'Sample data: this is not a real bar.'
    : (host ? `Source: <a href="${esc(v.sourceUrl)}" target="_blank" rel="noopener">${esc(host)}</a>` : 'Source unknown') + sourceDated;
  const age = v.verified ? daysSince(v.verified) : null;
  const stale = isStale(v);
  const checked = v.verified
    ? `Deals last checked <strong>${esc(fmtDate(v.verified))}</strong> (${fmtAge(age)})`
    : 'We don\'t know when these deals were last checked';

  el.innerHTML = `
    <div class="station-head">
      <button type="button" class="station-close" aria-label="Close">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
      <div class="bullets">${v.lines.map(bulletHtml).join('')}</div>
      <h2>${esc(v.name)}</h2>
      <span class="sub">${esc([v.neighborhood, v.type].filter(Boolean).join(' · '))}</span>
    </div>
    <div class="station-body">
      <div class="status-row"><span class="pill ${v.st.status}">${STATUS_LABEL[v.st.status]}</span><span class="status-note">${statusNote(v.st)}</span></div>
      <ul class="windows">${v.windows.map((w) => `<li><span class="days">${esc(fmtDays(w.days))}</span><span class="hours">${esc(fmtWindowTime(w))}</span>${w.area ? `<span class="area">${esc(w.area)}</span>` : ''}</li>`).join('')}</ul>
      <ul class="deals">${v.deals.map((d) => `<li><span class="cat">${esc(CAT_LABEL[d.category] || d.category)}</span><span class="what">${esc(d.item || d.text)}</span><span class="price">${esc(dealPrice(d))}</span></li>`).join('')}</ul>
      <p class="checked${stale ? ' is-stale' : ''}"><span>${checked}</span>${stale ? '<span class="stale-note">May be out of date. Call ahead, and tap "Report a change" if it\'s wrong.</span>' : ''}</p>
      <p class="source">${source}</p>
      <div class="actions">
        <a class="secondary" href="${esc(issue)}" target="_blank" rel="noopener">Report a change</a>
        <a class="primary" href="https://www.google.com/maps/search/?api=1&query=${lat},${lng}" target="_blank" rel="noopener">Directions</a>
      </div>
    </div>`;
  el.hidden = false;
}

// ---------- Map ----------

let map;
let mapReady = false;

function isStale(v) {
  const age = v.verified ? daysSince(v.verified) : null;
  return age === null || age > STALE_DAYS;
}

function iconName(v) {
  return `stop:${v.lines.join('.') || 'none'}:${v.st.status === 'live' ? 'live' : 'idle'}`;
}

// Draws a stop badge: a pill holding one lettered bullet per line, like a
// transit sign. Pouring-now stops get an amber pill.
function drawIcon(name) {
  const [, keys, mode] = name.split(':');
  const lines = keys === 'none' ? [] : keys.split('.');
  const scale = 2;
  const d = 18;
  const gap = 2;
  const pad = 3;
  const h = d + pad * 2;
  const w = lines.length ? pad * 2 + lines.length * d + (lines.length - 1) * gap : h;
  const canvas = document.createElement('canvas');
  canvas.width = (w + 2) * scale;
  canvas.height = (h + 2) * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  ctx.translate(1, 1);
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, h / 2);
  ctx.fillStyle = mode === 'live' ? '#FFB000' : '#FFFFFF';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#111111';
  ctx.stroke();
  if (!lines.length) {
    ctx.beginPath();
    ctx.arc(h / 2, h / 2, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#111111';
    ctx.fill();
  }
  ctx.font = '800 11px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((k, i) => {
    const l = LINES[k];
    const cx = pad + d / 2 + i * (d + gap);
    ctx.beginPath();
    ctx.arc(cx, h / 2, d / 2, 0, Math.PI * 2);
    ctx.fillStyle = l.color;
    ctx.fill();
    ctx.fillStyle = l.text;
    ctx.fillText(l.letter, cx, h / 2 + 0.5);
  });
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { width: canvas.width, height: canvas.height, data: img.data };
}

function stationGeoJSON(list) {
  return {
    type: 'FeatureCollection',
    features: list.map((v) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: v.coords },
      properties: {
        id: v.id,
        icon: iconName(v),
        // Higher keys draw on top, so pouring-now stops sit above the rest.
        order: 4 - RANK[v.st.status],
        rank: RANK[v.st.status],
        stale: isStale(v),
        label: v.st.status === 'live' && v.price != null ? `${v.name}  ${money(v.price)}` : v.name
      }
    }))
  };
}

function renderMap(list) {
  if (!mapReady) return;
  map.getSource('stations').setData(stationGeoJSON(list.filter((v) => v.st.status !== 'off')));
  map.setFilter('station-halo', ['==', ['get', 'id'], state.selected || '']);
}

function setupMap() {
  map = new maplibregl.Map({
    container: 'map',
    style: 'https://tiles.openfreemap.org/styles/positron',
    center: [-77.028, 38.905],
    zoom: window.matchMedia('(max-width: 820px)').matches ? 11.6 : 12.4,
    minZoom: 10.5,
    maxBounds: [[-77.25, 38.78], [-76.85, 39.02]],
    attributionControl: { compact: true }
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: false }), 'top-right');

  map.on('styleimagemissing', (e) => {
    if (e.id.startsWith('stop:') && !map.hasImage(e.id)) map.addImage(e.id, drawIcon(e.id), { pixelRatio: 2 });
  });

  map.on('load', () => {
    map.addSource('stations', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

    const size = ['interpolate', ['linear'], ['zoom'], 11, 0.7, 14, 1, 16, 1.2];
    map.addLayer({ id: 'station-halo', type: 'circle', source: 'stations', filter: ['==', ['get', 'id'], ''],
      paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 14, 16, 24], 'circle-color': '#FFB000', 'circle-opacity': 0.55,
        'circle-stroke-width': 2, 'circle-stroke-color': '#111111' } });
    map.addLayer({
      id: 'station-badge',
      type: 'symbol',
      source: 'stations',
      layout: {
        'icon-image': ['get', 'icon'],
        'icon-size': size,
        'icon-allow-overlap': true,
        'symbol-sort-key': ['get', 'order']
      },
      // Faded when the deals haven't been checked in a while.
      paint: { 'icon-opacity': ['case', ['get', 'stale'], 0.45, 1] }
    });
    map.addLayer({
      id: 'station-label',
      type: 'symbol',
      source: 'stations',
      minzoom: 12,
      layout: {
        'text-field': ['get', 'label'],
        'text-font': ['Noto Sans Bold'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 12, 11, 16, 14],
        'text-offset': [0, 1.3],
        'text-anchor': 'top',
        'symbol-sort-key': ['get', 'rank']
      },
      paint: { 'text-color': '#111111', 'text-halo-color': '#F4F2EC', 'text-halo-width': 2 }
    });

    for (const layer of ['station-badge', 'station-label']) {
      map.on('click', layer, (e) => select(e.features[0].properties.id, false));
      map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
    }
    mapReady = true;
    render();
  });
}

// ---------- Interaction ----------

function select(id, fly = true) {
  state.selected = id;
  render();
  const v = state.venues.find((x) => x.id === id);
  if (v && fly && mapReady) map.flyTo({ center: v.coords, zoom: Math.max(map.getZoom(), 14) });
  if (v && window.matchMedia('(max-width: 820px)').matches) $('station').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function render() {
  const all = withStatus();
  const visible = all.filter(isVisible);
  renderClock();
  renderBoard(visible);
  renderChips(all);
  renderStation(all);
  renderMap(visible);
}

function setupControls() {
  $('day').innerHTML = DAYS.map((d) => `<option value="${d}">${DAY_LABELS[d]}</option>`).join('');
  $('day').addEventListener('change', (e) => { state.followNow = false; state.moment = { ...state.moment, day: e.target.value }; render(); });
  $('time').addEventListener('change', (e) => {
    if (!e.target.value) return;
    state.followNow = false;
    state.moment = { ...state.moment, min: toMin(e.target.value) };
    render();
  });
  $('now').addEventListener('click', () => { state.followNow = true; state.moment = nowInDC(); render(); });
  $('search').addEventListener('input', (e) => { state.query = e.target.value.trim().toLowerCase(); render(); });
  $('live-only').addEventListener('click', (e) => {
    state.liveOnly = !state.liveOnly; e.currentTarget.setAttribute('aria-pressed', String(state.liveOnly)); render();
  });
  $('food-only').addEventListener('click', (e) => {
    state.foodOnly = !state.foodOnly; e.currentTarget.setAttribute('aria-pressed', String(state.foodOnly)); render();
  });
  $('line-chips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-line]');
    if (!b) return;
    const k = b.dataset.line;
    if (state.off.has(k)) state.off.delete(k); else state.off.add(k);
    render();
  });
  $('board').addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (b) select(b.dataset.id);
  });
  $('station').addEventListener('click', (e) => {
    if (e.target.closest('.station-close')) { state.selected = null; render(); }
  });
  setInterval(() => {
    if (state.followNow) { state.moment = nowInDC(); render(); }
  }, 60 * 1000);
}

async function main() {
  setupControls();
  renderClock();
  setupMap();
  const { venues, sample, updated } = await loadData();
  state.venues = venues;
  state.sample = sample;
  $('sample-badge').hidden = !sample;
  $('data-updated').textContent = updated ? `Happy hours last updated ${fmtDate(updated)}.` : '';
  render();
}

main();
