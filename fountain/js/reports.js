// Fizz reports: shared ones from the report server, plus everyone's own log
// of the Diet Cokes they've had, kept on their device.
import { FOUNTAIN_API } from './config.js';

const LOG_KEY = 'fizz-finder:log:v1';

export const sharing = () => !!FOUNTAIN_API;

export async function fetchShared() {
  if (!FOUNTAIN_API) return { reports: [], places: [] };
  try {
    const res = await fetch(`${FOUNTAIN_API}/fountain/reports`);
    if (!res.ok) return { reports: [], places: [] };
    const data = await res.json();
    return { reports: data.reports || [], places: data.places || [] };
  } catch {
    return { reports: [], places: [] };
  }
}

async function post(path, body) {
  const res = await fetch(`${FOUNTAIN_API}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong saving that. Try again in a minute.');
  return data;
}

export const sendReport = async (report) => (await post('/fountain/reports', report)).report;
export const sendPlace = (place, report) => post('/fountain/places', { place, report });

export async function placeHistory(id) {
  if (!FOUNTAIN_API) return null;
  try {
    const res = await fetch(`${FOUNTAIN_API}/fountain/reports?place=${encodeURIComponent(id)}`);
    return res.ok ? (await res.json()).reports || [] : null;
  } catch {
    return null;
  }
}

// ---------- Your log, on this device ----------

export function readLog() {
  try {
    const list = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeLog(list) {
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export function addToLog(entry) {
  const list = readLog();
  const item = { local_id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, created_at: new Date().toISOString(), ...entry };
  list.unshift(item);
  writeLog(list.slice(0, 2000));
  return item;
}

export function removeFromLog(localId) {
  writeLog(readLog().filter((e) => e.local_id !== localId));
}

// Your tally: how many you've logged, where, and how they rated.
export function logStats(list, now = new Date()) {
  const poured = list.filter((e) => e.status === 'pouring');
  const month = now.toISOString().slice(0, 7);
  const rated = poured.filter((e) => e.fizz);
  const byPlace = new Map();
  for (const e of poured) byPlace.set(e.place_id, (byPlace.get(e.place_id) || 0) + 1);
  const fav = [...byPlace.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    total: poured.length,
    thisMonth: poured.filter((e) => String(e.created_at).startsWith(month)).length,
    places: byPlace.size,
    fizz: rated.length ? Math.round((rated.reduce((s, e) => s + e.fizz, 0) / rated.length) * 10) / 10 : null,
    favorite: fav ? { place_id: fav[0], count: fav[1], name: poured.find((e) => e.place_id === fav[0])?.place_name } : null
  };
}
