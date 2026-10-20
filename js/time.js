// Happy hour timing: works out whether a venue is pouring at a given moment.
// Times are minutes since midnight, local DC time. A window with no end runs
// until close, which we treat as 2 am.

export const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const DAY_LABELS = { sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat' };
const CLOSE = 26 * 60;
const SOON = 60;
// When a source gives a start but no end, assume a typical three-hour happy hour
// for the "is it on now" check, and say the end time isn't listed.
const ASSUMED_LENGTH = 3 * 60;

export function toMin(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + (m || 0);
}

// Returns null when the window's times or days aren't known.
export function span(w) {
  if (!w || !Array.isArray(w.days) || !w.days.length) return null;
  if (!w.start) {
    if (w.end_label === 'all day') return { start: 0, end: 24 * 60, endKnown: true, allDay: true };
    if (w.end_label === 'close') return { start: 0, end: CLOSE, endKnown: true, allDay: true };
    return null;
  }
  const start = toMin(w.start);
  if (!w.end && !w.end_label) return { start, end: start + ASSUMED_LENGTH, endKnown: false };
  let end = w.end ? toMin(w.end) : CLOSE;
  if (end <= start) end += 24 * 60;
  return { start, end, endKnown: true };
}

// moment: { day: 'mon', min: 1092 }
// Returns { status: 'live'|'soon'|'later'|'ended'|'off'|'unknown', minsLeft, minsUntil, window, endKnown, allDay }
export function statusAt(windows, moment) {
  const dayIdx = DAYS.indexOf(moment.day);
  const prev = DAYS[(dayIdx + 6) % 7];
  let best = null;
  let hadToday = false;
  let usable = 0;

  for (const w of windows || []) {
    const sp = span(w);
    if (!sp) continue;
    usable++;
    const { start, end, endKnown, allDay = false } = sp;

    // Yesterday's window running past midnight.
    if (w.days.includes(prev) && end > 24 * 60 && moment.min < end - 24 * 60) {
      const left = end - 24 * 60 - moment.min;
      if (!best || best.status !== 'live' || left < best.minsLeft) best = { status: 'live', minsLeft: left, window: w, endKnown, allDay };
    }
    if (!w.days.includes(moment.day)) continue;
    hadToday = true;
    if (moment.min >= start && moment.min < end) {
      const left = end - moment.min;
      if (!best || best.status !== 'live' || left < best.minsLeft) best = { status: 'live', minsLeft: left, window: w, endKnown, allDay };
    } else if (start > moment.min && (!best || best.status !== 'live')) {
      const until = start - moment.min;
      if (!best || best.minsUntil === undefined || until < best.minsUntil) {
        best = { status: until <= SOON ? 'soon' : 'later', minsUntil: until, window: w };
      }
    }
  }
  if (best) return best;
  if (!usable) return { status: 'unknown' };
  return { status: hadToday ? 'ended' : 'off' };
}

export function fmtClock(min) {
  min = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(min / 60);
  const m = min % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const ap = h < 12 ? 'am' : 'pm';
  return m ? `${h12}:${String(m).padStart(2, '0')} ${ap}` : `${h12} ${ap}`;
}

export function fmtDuration(mins) {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

export function fmtWindowTime(w) {
  if (!w.start) {
    if (w.end_label === 'all day') return 'All day';
    if (w.end_label === 'close') return 'Until close';
    return 'Times not listed';
  }
  const start = toMin(w.start);
  if (!w.end && !w.end_label) return `From ${fmtClock(start)}`;
  const end = w.end ? fmtClock(toMin(w.end)) : (w.end_label || 'close');
  return `${fmtClock(start)}–${end}`;
}

// ['mon','tue','wed','thu','fri'] -> 'Mon–Fri'
export function fmtDays(days) {
  if (!days || !days.length) return 'Days not listed';
  if (days.length === 7) return 'Every day';
  // Order Monday-first so weekday runs read naturally.
  const order = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const idx = days.map((d) => order.indexOf(d)).filter((i) => i >= 0).sort((a, b) => a - b);
  const runs = [];
  for (const i of idx) {
    const last = runs[runs.length - 1];
    if (last && i === last[1] + 1) last[1] = i;
    else runs.push([i, i]);
  }
  return runs.map(([a, b]) => {
    const A = DAY_LABELS[order[a]];
    const B = DAY_LABELS[order[b]];
    if (a === b) return A;
    if (b === a + 1) return `${A}, ${B}`;
    return `${A}–${B}`;
  }).join(', ');
}

export function nowInDC(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t).value;
  const day = get('weekday').slice(0, 3).toLowerCase();
  const hour = Number(get('hour')) % 24;
  return { day, min: hour * 60 + Number(get('minute')) };
}

// '2026-10-12' -> 'Oct 12, 2026'. Dates are calendar days, so format in UTC to avoid shifting.
export function fmtDate(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export function daysSince(iso, now = new Date()) {
  const d = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(d)) return null;
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((today - d) / 86400000));
}

export function fmtAge(days) {
  if (days === null) return '';
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 45) return `${days} days ago`;
  const months = Math.round(days / 30);
  return months < 12 ? `${months} months ago` : 'over a year ago';
}
