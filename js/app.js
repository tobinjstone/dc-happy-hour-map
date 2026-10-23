import { DAYS, DAY_LABELS, statusAt, nowInDC, fmtClock, fmtDuration, fmtDays, fmtWindowTime, toMin, fmtDate, daysSince, fmtAge } from './time.js';
import { LINES, LINE_ORDER, linesFor } from './lines.js';
import { applyEdit } from './edit-model.js';
import { editsEnabled, fetchEdits, openEditor, openHistory } from './editor.js';

const REPO = 'tobinjstone/dc-happy-hour-map';
const DRINKS = new Set(['beer', 'wine', 'cocktail', 'spirits']);
const CAT_LABEL = { beer: 'Beer', wine: 'Wine', cocktail: 'Cocktail', spirits: 'Rail', food: 'Food', other: 'Other' };
const UNLISTED_LABEL = 'No happy hour listed';
const STATUS_LABEL = { live: 'Pouring now', soon: 'Arriving', later: 'Later today', ended: 'Done today', off: 'Not today', unknown: 'Times not listed' };
const STALE_DAYS = 60;
const RANK = { live: 0, soon: 1, later: 2, ended: 3, unknown: 3, off: 4 };
const TYPE_LABEL = { bar: 'Bar', nightclub: 'Nightclub', restaurant: 'Restaurant', hotel: 'Hotel bar', multipurpose: 'Venue', arena: 'Arena' };

const state = {
  // Bars as the crawl found them, and the newest visitor edit for each.
  base: [],
  edits: new Map(),
  venues: [],
  sample: false,
  followNow: true,
  moment: nowInDC(),
  off: new Set(),
  // Show only bars whose happy hour is on at the picked time; "All bars" turns it off.
  liveOnly: true,
  foodOnly: false,
  allDayOnly: false,
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

// Bars we know about but haven't found a happy hour for. They show faintly
// under "All bars" so visitors can add one.
async function loadUnlisted() {
  try {
    const res = await fetch('data/unlisted.geojson', { cache: 'no-cache' });
    if (!res.ok) return [];
    const fc = await res.json();
    return (fc.features || []).map((f) => {
      const p = f.properties || {};
      const c = f.geometry && f.geometry.coordinates;
      if (!c) return null;
      return derive({
        id: String(p.id), name: p.name || 'Unnamed bar', neighborhood: p.neighborhood || '',
        type: TYPE_LABEL[p.venue_type] || p.venue_type || '', coords: [Number(c[0]), Number(c[1])],
        windows: [], deals: [], website: p.website || '', sourceUrl: '', summary: '', confidence: '',
        verified: '', crawlVerified: '', sourceDate: '', unlisted: true
      });
    }).filter(Boolean);
  } catch {
    return [];
  }
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
  if (!coords) return null;
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
    summary: p.summary || '',
    confidence: p.confidence || '',
    verified: p.last_verified || '',
    crawlVerified: p.last_verified || '',
    sourceDate: p.source_date || '',
    sample: !!p.sample
  };
  return derive(v);
}

function derive(v) {
  v.lines = linesFor(v);
  v.hasFood = v.deals.some((d) => d.category === 'food');
  v.price = cheapestDrink(v.deals);
  v.search = `${v.name} ${v.neighborhood}`.toLowerCase();
  return v;
}

function applyEdits() {
  state.venues = state.base.map((v) => {
    const e = state.edits.get(v.id);
    if (!e) return v;
    const edited = derive(applyEdit(v, e));
    // A visitor-added happy hour puts an unlisted bar on the map properly.
    if (edited.unlisted && edited.edit && edited.windows.length) edited.unlisted = false;
    return edited;
  });
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
  // Unlisted bars show under "All bars", or when someone searches for them by name.
  if (v.unlisted) return (!state.liveOnly || !!state.query) && !state.foodOnly && !state.allDayOnly && (!state.query || v.search.includes(state.query));
  if (state.liveOnly && v.st.status !== 'live') return false;
  if (state.foodOnly && !v.hasFood) return false;
  if (state.allDayOnly && !v.st.allDay) return false;
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
    default: return typeof p === 'number' ? money(p) : (d.price_text || '');
  }
}

function windowEnd(w) {
  return w.end ? fmtClock(toMin(w.end)) : (w.end_label || 'close');
}

function statusNote(st) {
  switch (st.status) {
    case 'live': if (st.allDay) return st.window.end_label === 'close' ? 'Happy hour until close today' : 'All-day happy hour today';
      return st.endKnown === false ? `Started ${fmtClock(toMin(st.window.start))}, end time not listed` : `Ends ${windowEnd(st.window)}, ${fmtDuration(st.minsLeft)} left`;
    case 'soon': return `Starts ${fmtClock(toMin(st.window.start))}, in ${fmtDuration(st.minsUntil)}`;
    case 'later': return `Starts ${fmtClock(toMin(st.window.start))}`;
    case 'ended': return 'Done for today';
    case 'unknown': return 'Check with the bar for times';
    default: return `No happy hour on ${DAY_LABELS[state.moment.day]}`;
  }
}

function boardTime(st) {
  if (st.status === 'live') return st.endKnown === false ? 'ON NOW' : `${st.minsLeft} LEFT`;
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
  $('show-live').textContent = state.followNow
    ? 'On now'
    : `On at ${DAY_LABELS[state.moment.day]} ${fmtClock(state.moment.min)}`;
  $('show-live').setAttribute('aria-pressed', String(state.liveOnly));
  $('show-all').setAttribute('aria-pressed', String(!state.liveOnly));
}

function renderBoard(list) {
  // All-day happy hours don't count down, so they get one summary row
  // instead of crowding out the timed ones.
  const allDay = list.filter((v) => !v.unlisted && v.st.allDay);
  const rows = list
    .filter((v) => !v.unlisted && v.st.status !== 'off' && v.st.status !== 'unknown' && !v.st.allDay)
    .sort((a, b) => RANK[a.st.status] - RANK[b.st.status] ||
      (a.st.minsLeft ?? a.st.minsUntil ?? 0) - (b.st.minsLeft ?? b.st.minsUntil ?? 0))
    .slice(0, allDay.length ? 7 : 8);
  const ol = $('board');
  // Searching for a bar with no happy hour listed still finds it.
  const unlistedRows = state.query ? list.filter((v) => v.unlisted).slice(0, 3).map((v) => `
    <li><button type="button" class="board-row is-dim${v.id === state.selected ? ' is-selected' : ''}" data-id="${esc(v.id)}">
      <span class="dots"></span>
      <span class="n">${esc(v.name.toUpperCase())}</span>
      <span class="t">NO HH</span>
    </button></li>`).join('') : '';
  const allDayRow = allDay.length ? `
    <li><button type="button" class="board-row board-allday${state.allDayOnly ? ' is-selected' : ''}" data-allday aria-pressed="${state.allDayOnly}">
      <span class="dots"><span class="dot-24">24</span></span>
      <span class="n">${state.allDayOnly ? 'SHOWING ALL-DAY ONLY' : 'ALL-DAY HAPPY HOURS'}</span>
      <span class="t">${allDay.length} ${allDay.length === 1 ? 'BAR' : 'BARS'}</span>
    </button></li>` : '';
  if (!rows.length && !allDayRow && !unlistedRows) {
    ol.innerHTML = `<li class="board-empty">NO HAPPY HOURS ${state.liveOnly ? 'ON' : ''} ${state.followNow ? (state.liveOnly ? 'RIGHT NOW' : 'TODAY') : 'AT THIS TIME'}</li>`;
    return;
  }
  ol.innerHTML = rows.map((v) => `
    <li><button type="button" class="board-row${v.id === state.selected ? ' is-selected' : ''}${v.st.status === 'ended' ? ' is-dim' : ''}" data-id="${esc(v.id)}">
      <span class="dots">${v.lines.map((k) => `<span class="dot" style="background:${LINES[k].color}"></span>`).join('')}</span>
      <span class="n">${esc(v.name.toUpperCase())}</span>
      <span class="t">${boardTime(v.st)}</span>
    </button></li>`).join('') + allDayRow + unlistedRows;
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
  const editedSource = v.edit
    ? `Edited by ${v.edit.staff ? 'someone who works here' : 'a visitor'} from ${v.edit.photo
      ? `<a href="${esc(v.edit.photo)}" target="_blank" rel="noopener">a photo of the menu</a>`
      : `<a href="${esc(v.edit.link)}" target="_blank" rel="noopener">${esc(host || 'a link')}</a>`}`
    : '';
  const source = v.sample
    ? 'Sample data: this is not a real bar.'
    : editedSource || (host ? `Source: <a href="${esc(v.sourceUrl)}" target="_blank" rel="noopener">${esc(host)}</a>` : 'Source unknown') + sourceDated;
  const age = v.verified ? daysSince(v.verified) : null;
  const stale = isStale(v);
  const checked = v.verified
    ? `Deals last checked <strong>${esc(fmtDate(v.verified))}</strong> (${fmtAge(age)})`
    : 'We don\'t know when these deals were last checked';

  if (v.unlisted) { renderUnlisted(el, v, issue, lat, lng); return; }
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
      ${v.noHappyHour
        ? '<div class="status-row"><span class="pill off">No happy hour</span><span class="status-note">Someone reported it\'s gone</span></div>'
        : `<div class="status-row"><span class="pill ${v.st.status}">${STATUS_LABEL[v.st.status]}</span><span class="status-note">${statusNote(v.st)}</span></div>
      ${v.windows.length ? '' : '<p class="summary">Days and times not listed.</p>'}`}
      <ul class="windows">${v.windows.map((w) => `<li><span class="days">${esc(fmtDays(w.days))}</span><span class="hours">${esc(fmtWindowTime(w))}</span>${w.area ? `<span class="area">${esc(w.area)}</span>` : ''}</li>`).join('')}</ul>
      <ul class="deals">${v.deals.map((d) => `<li><span class="cat">${esc(CAT_LABEL[d.category] || d.category)}</span><span class="what">${esc(d.item || d.text)}</span><span class="price">${esc(dealPrice(d))}</span></li>`).join('')}</ul>
      ${!v.deals.length && v.summary ? `<p class="summary">${esc(v.summary)}</p>` : ''}
      ${v.confidence === 'low' ? '<p class="confidence">From a third-party listing, so double-check with the bar.</p>' : ''}
      <p class="checked${stale ? ' is-stale' : ''}"><span>${checked}</span>${stale ? `<span class="stale-note">May be out of date. Call ahead, and tap "${editsEnabled() ? 'Edit this bar' : 'Report a change'}" if it's wrong.</span>` : ''}</p>
      <p class="source">${source}${v.edit ? ' · <button type="button" class="link-btn" data-history>History</button>' : ''}</p>
      <div class="actions">
        ${editsEnabled() && !v.sample
          ? '<button type="button" class="secondary" data-edit>Edit this bar</button>'
          : `<a class="secondary" href="${esc(issue)}" target="_blank" rel="noopener">Report a change</a>`}
        <a class="primary" href="https://www.google.com/maps/search/?api=1&query=${lat},${lng}" target="_blank" rel="noopener">Directions</a>
      </div>
    </div>`;
  el.hidden = false;
}

function renderUnlisted(el, v, issue, lat, lng) {
  let host = '';
  try { host = v.website ? new URL(v.website).hostname.replace(/^www\./, '') : ''; } catch { host = ''; }
  const add = editsEnabled()
    ? '<button type="button" class="secondary" data-edit>Add a happy hour</button>'
    : `<a class="secondary" href="${esc(issue)}" target="_blank" rel="noopener">Add a happy hour</a>`;
  el.innerHTML = `
    <div class="station-head">
      <button type="button" class="station-close" aria-label="Close">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
      <h2>${esc(v.name)}</h2>
      <span class="sub">${esc([v.neighborhood, v.type].filter(Boolean).join(' · '))}</span>
    </div>
    <div class="station-body">
      <div class="status-row"><span class="pill unknown">${UNLISTED_LABEL}</span></div>
      <p class="summary">We couldn't find a happy hour for this spot${host ? ` on <a href="${esc(v.website)}" target="_blank" rel="noopener">${esc(host)}</a>` : ''}. If you know one, add it with a link or a photo of the menu.</p>
      <div class="actions">
        ${add}
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
  const mode = v.st.status !== 'live' ? 'idle' : v.st.allDay ? 'allday' : 'live';
  return `stop:${v.lines.join('.') || 'none'}:${mode}`;
}

// Draws a stop badge: a pill holding one lettered bullet per line, like a
// transit sign. Pouring-now stops get an amber pill.
function drawIcon(name) {
  const [, keys, mode] = name.split(':');
  const lines = keys === 'none' ? [] : keys.split('.');
  // All-day stops carry an extra black "24" bullet, like 24-hour service.
  if (mode === 'allday') lines.push('24');
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
  ctx.fillStyle = mode === 'idle' ? '#FFFFFF' : '#FFB000';
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
    const l = LINES[k] || { color: '#111111', text: '#FFFFFF', letter: k };
    const cx = pad + d / 2 + i * (d + gap);
    ctx.beginPath();
    ctx.arc(cx, h / 2, d / 2, 0, Math.PI * 2);
    ctx.fillStyle = l.color;
    ctx.fill();
    ctx.fillStyle = l.text;
    ctx.font = l.letter.length > 1 ? '800 9px Inter, system-ui, sans-serif' : '800 11px Inter, system-ui, sans-serif';
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
        unlisted: !!v.unlisted,
        label: v.st.status === 'live' ? [v.name, v.price != null ? money(v.price) : '', v.st.allDay ? 'all day' : ''].filter(Boolean).join('  ') : v.name
      }
    }))
  };
}

function renderMap(list) {
  if (!mapReady) return;
  map.getSource('stations').setData(stationGeoJSON(list.filter((v) => v.unlisted || v.st.status !== 'off')));
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
    // Unlisted bars: small hollow dots, under everything else.
    map.addLayer({ id: 'station-unlisted', type: 'circle', source: 'stations', filter: ['get', 'unlisted'],
      paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 2.5, 16, 6], 'circle-color': '#FFFFFF',
        'circle-stroke-width': 1.5, 'circle-stroke-color': '#8A857A' } });
    map.addLayer({
      id: 'station-badge',
      type: 'symbol',
      source: 'stations',
      filter: ['!', ['get', 'unlisted']],
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
        // Unlisted bars get a name only once you're zoomed in close.
        'text-field': ['step', ['zoom'], ['case', ['get', 'unlisted'], '', ['get', 'label']], 15, ['get', 'label']],
        'text-font': ['Noto Sans Bold'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 12, 11, 16, 14],
        'text-offset': [0, 1.3],
        'text-anchor': 'top',
        'symbol-sort-key': ['get', 'rank']
      },
      paint: { 'text-color': '#111111', 'text-halo-color': '#F4F2EC', 'text-halo-width': 2 }
    });

    for (const layer of ['station-unlisted', 'station-badge', 'station-label']) {
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
  $('show-live').addEventListener('click', () => { state.liveOnly = true; render(); });
  $('show-all').addEventListener('click', () => { state.liveOnly = false; render(); });
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
    if (e.target.closest('[data-allday]')) { state.allDayOnly = !state.allDayOnly; render(); return; }
    const b = e.target.closest('[data-id]');
    if (b) select(b.dataset.id);
  });
  $('station').addEventListener('click', (e) => {
    if (e.target.closest('.station-close')) { state.selected = null; render(); }
    const v = state.venues.find((x) => x.id === state.selected);
    if (v && e.target.closest('[data-edit]')) openEditor(v, saved);
    if (v && e.target.closest('[data-history]')) openHistory(v, saved);
  });
  setInterval(() => {
    if (state.followNow) { state.moment = nowInDC(); render(); }
  }, 60 * 1000);
}

// An edit or restore just saved: show it straight away.
function saved(edit) {
  state.edits.set(edit.venue_id, edit);
  applyEdits();
  render();
}

async function main() {
  setupControls();
  renderClock();
  setupMap();
  const [{ venues, sample, updated }, unlisted, edits] = await Promise.all([loadData(), loadUnlisted(), fetchEdits()]);
  state.base = venues.concat(sample ? [] : unlisted);
  for (const e of edits) state.edits.set(e.venue_id, e);
  applyEdits();
  state.sample = sample;
  $('sample-badge').hidden = !sample;
  const lastEdit = edits.map((e) => String(e.created_at).slice(0, 10)).sort().pop() || '';
  const newest = [updated, lastEdit].sort().pop();
  $('data-updated').textContent = newest ? `Happy hours last updated ${fmtDate(newest)}.` : '';
  if (editsEnabled()) $('fix-hint').textContent = 'Spot one that\'s wrong? Tap the bar, then "Edit this bar". Changes show up for everyone right away.';
  render();
}

main();
