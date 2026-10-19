// Happy hour timing: works out whether a venue is pouring at a given moment.
// Times are minutes since midnight, local DC time. A window with no end runs
// until close, which we treat as 2 am.

export const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const DAY_LABELS = { sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat' };
const CLOSE = 26 * 60;
const SOON = 60;

export function toMin(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + (m || 0);
}

function span(w) {
  const start = toMin(w.start);
  let end = w.end ? toMin(w.end) : CLOSE;
  if (end <= start) end += 24 * 60;
  return { start, end };
}

// moment: { day: 'mon', min: 1092 }
// Returns { status: 'live'|'soon'|'later'|'ended'|'off', minsLeft, minsUntil, window }
export function statusAt(windows, moment) {
  const dayIdx = DAYS.indexOf(moment.day);
  const prev = DAYS[(dayIdx + 6) % 7];
  let best = null;
  let hadToday = false;

  for (const w of windows || []) {
    if (!w || !w.start || !Array.isArray(w.days)) continue;
    const { start, end } = span(w);

    // Yesterday's window running past midnight.
    if (w.days.includes(prev) && end > 24 * 60 && moment.min < end - 24 * 60) {
      const left = end - 24 * 60 - moment.min;
      if (!best || best.status !== 'live' || left < best.minsLeft) best = { status: 'live', minsLeft: left, window: w };
    }
    if (!w.days.includes(moment.day)) continue;
    hadToday = true;
    if (moment.min >= start && moment.min < end) {
      const left = end - moment.min;
      if (!best || best.status !== 'live' || left < best.minsLeft) best = { status: 'live', minsLeft: left, window: w };
    } else if (start > moment.min && (!best || best.status !== 'live')) {
      const until = start - moment.min;
      if (!best || best.minsUntil === undefined || until < best.minsUntil) {
        best = { status: until <= SOON ? 'soon' : 'later', minsUntil: until, window: w };
      }
    }
  }
  if (best) return best;
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
  const start = toMin(w.start);
  const end = w.end ? fmtClock(toMin(w.end)) : (w.end_label || 'close');
  return `${fmtClock(start)}–${end}`;
}

// ['mon','tue','wed','thu','fri'] -> 'Mon–Fri'
export function fmtDays(days) {
  if (!days || !days.length) return '';
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
