// Opening hours: reads the OpenStreetMap opening_hours strings that chain
// store locators publish ("Mo-Th 10:30-22:00; Fr-Sa 10:30-23:00; Su closed",
// "24/7") and works out whether a place is open at a given moment of its own
// local time (see zones.js).
// Anything it can't read comes back as null, shown as "Hours not listed".
import { DAYS, DAY_LABELS, fmtClock } from '../../js/time.js';

const CODES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const DAY_MIN = 24 * 60;
const SOON = 60;

function parseDays(s) {
  const out = new Set();
  for (const part of s.split(',')) {
    const m = part.trim().match(/^([A-Z][a-z])(?:-([A-Z][a-z]))?$/);
    if (!m) return null;
    const a = CODES.indexOf(m[1]);
    const b = m[2] ? CODES.indexOf(m[2]) : a;
    if (a < 0 || b < 0) return null;
    // Ranges can wrap the week, like Fr-Mo.
    for (let i = a; ; i = (i + 1) % 7) {
      out.add(i);
      if (i === b) break;
    }
  }
  return [...out];
}

function parseTimes(s) {
  const spans = [];
  for (const part of s.split(',')) {
    const m = part.trim().match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})\+?$/);
    if (!m) return null;
    const start = Number(m[1]) * 60 + Number(m[2]);
    let end = Number(m[3]) * 60 + Number(m[4]);
    if (start > DAY_MIN || end > 2 * DAY_MIN) return null;
    // An end at or before the start runs past midnight.
    if (end <= start) end += DAY_MIN;
    spans.push([start, end]);
  }
  return spans.sort((x, y) => x[0] - y[0]);
}

// Returns { week: [[ [start, end], ... ] x7 indexed Sun..Sat], always } or null.
export function parseHours(input) {
  const s = String(input ?? '').trim();
  if (!s) return null;
  if (/^(24\/7|Mo-Su 00:00-24:00)$/.test(s)) return { always: true, week: Array.from({ length: 7 }, () => [[0, DAY_MIN]]) };
  const week = Array.from({ length: 7 }, () => null);
  for (const rule of s.split(';').map((r) => r.trim()).filter(Boolean)) {
    // Holiday rules are left out; on a normal day they don't apply.
    if (/^PH\b|^SH\b/.test(rule)) continue;
    let m = rule.match(/^([A-Za-z,\- ]+?)\s+(closed|off)$/i);
    if (m) {
      const days = parseDays(m[1].replace(/\s+/g, ''));
      if (!days) return null;
      for (const d of days) week[d] = [];
      continue;
    }
    if (/^(closed|off)$/i.test(rule)) { week.fill([]); continue; }
    m = rule.match(/^(?:([A-Z][a-z][A-Za-z,\-]*)\s+)?([\d:,\-+ ]+)$/);
    if (!m) return null;
    const days = m[1] ? parseDays(m[1]) : [0, 1, 2, 3, 4, 5, 6];
    const spans = parseTimes(m[2].replace(/\s+/g, ''));
    if (!days || !spans) return null;
    // A later rule for the same day replaces the earlier one, as in OSM.
    for (const d of days) week[d] = spans;
  }
  if (week.every((d) => d === null)) return null;
  const filled = week.map((d) => d || []);
  const always = filled.every((d) => d.some(([a, b]) => a === 0 && b >= DAY_MIN));
  return { always, week: filled };
}

// moment: { day: 'mon', min: 1092 }
// Returns { open, minsLeft, closesAt, opensIn, opensAt: { day, min }, always } or { unknown: true }.
export function openAt(hours, moment) {
  if (!hours) return { unknown: true };
  if (hours.always) return { open: true, always: true };
  const d = DAYS.indexOf(moment.day);
  const now = moment.min;
  // Lay yesterday, today and tomorrow on one line, joining stretches that touch,
  // so a place that closes at midnight and reopens at once reads as still open.
  const line = [];
  for (const [off, i] of [[-DAY_MIN, (d + 6) % 7], [0, d], [DAY_MIN, (d + 1) % 7]]) {
    for (const [a, b] of hours.week[i]) line.push([a + off, b + off]);
  }
  line.sort((x, y) => x[0] - y[0]);
  const merged = [];
  for (const [a, b] of line) {
    const last = merged[merged.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  const cur = merged.find(([a, b]) => a <= now && now < b);
  if (cur) return { open: true, minsLeft: cur[1] - now, closesAt: ((cur[1] % DAY_MIN) + DAY_MIN) % DAY_MIN };
  for (let k = 0; k < 7; k++) {
    const day = (d + k) % 7;
    const starts = hours.week[day].map(([a]) => a).filter((a) => k > 0 || a > now);
    if (starts.length) {
      const a = Math.min(...starts);
      return { open: false, opensIn: k * DAY_MIN + a - now, opensAt: { day: DAYS[day], min: a } };
    }
  }
  return { open: false };
}

export const clock = (min) => (((min % DAY_MIN) + DAY_MIN) % DAY_MIN === 0 ? 'midnight' : fmtClock(min));

// A short line for a place card or list row.
export function openNote(st, moment) {
  if (!st || st.unknown) return 'Hours not listed';
  if (st.always) return 'Open 24 hours';
  if (st.open) {
    if (st.minsLeft >= DAY_MIN) return 'Open 24 hours today';
    return st.minsLeft <= SOON ? `Closes soon · ${clock(st.closesAt)}` : `Open until ${clock(st.closesAt)}`;
  }
  if (!st.opensAt) return 'Closed';
  const sameDay = st.opensAt.day === moment.day;
  const tomorrow = DAYS[(DAYS.indexOf(moment.day) + 1) % 7] === st.opensAt.day;
  const when = sameDay ? '' : tomorrow ? ' tomorrow' : ` ${DAY_LABELS[st.opensAt.day]}`;
  return `Closed · opens${when} ${clock(st.opensAt.min)}`;
}

function fmtSpan([a, b]) {
  if (a === 0 && b >= DAY_MIN) return '24 hours';
  return `${clock(a)}–${clock(b)}`;
}

// The week as rows like { days: 'Mon–Thu', hours: '10:30 am–10 pm' }, Monday first.
export function weekRows(hours) {
  if (!hours) return [];
  if (hours.always) return [{ days: 'Every day', hours: '24 hours' }];
  // Show "6 am–1 am" on the night it starts, rather than a "midnight–1 am"
  // stub on the next day, which is how locators write late nights.
  const shown = hours.week.map((spans) => spans.map((s) => [...s]));
  for (let d = 0; d < 7; d++) {
    const next = (d + 1) % 7;
    for (const span of shown[d]) {
      if (span[1] !== DAY_MIN || span[0] === 0) continue;
      const tail = shown[next].findIndex(([a, b]) => a === 0 && b < DAY_MIN);
      if (tail < 0) continue;
      span[1] = DAY_MIN + shown[next][tail][1];
      shown[next].splice(tail, 1);
    }
  }
  const order = [1, 2, 3, 4, 5, 6, 0];
  const text = (i) => (shown[i].length ? shown[i].map(fmtSpan).join(', ') : 'Closed');
  const rows = [];
  for (const i of order) {
    const t = text(i);
    const last = rows[rows.length - 1];
    if (last && last.hours === t) last.to = i;
    else rows.push({ from: i, to: i, hours: t });
  }
  if (rows.length === 1) return [{ days: 'Every day', hours: rows[0].hours }];
  return rows.map((r) => ({
    days: r.from === r.to ? DAY_LABELS[DAYS[r.from]] : `${DAY_LABELS[DAYS[r.from]]}–${DAY_LABELS[DAYS[r.to]]}`,
    hours: r.hours
  }));
}
