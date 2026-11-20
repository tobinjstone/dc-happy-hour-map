// Which time zone a place keeps, so "open now" uses its own clock. Most states
// have one zone; for the ones split between two, a longitude line close to
// the real boundary is good enough for opening hours.
import { DAYS } from '../../js/time.js';

const E = 'America/New_York';
const C = 'America/Chicago';
const M = 'America/Denver';
const P = 'America/Los_Angeles';

const BY_STATE = {
  CT: E, DE: E, DC: E, GA: E, ME: E, MD: E, MA: E, NH: E, NJ: E, NY: E, NC: E, OH: E, PA: E, RI: E, SC: E, VT: E, VA: E, WV: E,
  AL: C, AR: C, IL: C, IA: C, LA: C, MN: C, MS: C, MO: C, OK: C, WI: C,
  CO: M, MT: M, NM: M, UT: M, WY: M,
  CA: P, NV: P, WA: P,
  AZ: 'America/Phoenix', AK: 'America/Anchorage', HI: 'Pacific/Honolulu'
};

export function zoneOf(state, lng, lat) {
  switch (state) {
    case 'FL': return lng < -85.0 && lat > 29.6 ? C : E;
    case 'IN': return lng < -86.9 ? C : E;
    case 'KY': return lng < -86.0 ? C : E;
    case 'MI': return lng < -87.6 && lat > 45.0 ? C : E;
    case 'TN': return lng < -85.4 ? C : E;
    case 'TX': return lng < -104.9 ? M : C;
    case 'KS': return lng < -101.5 ? M : C;
    case 'NE': return lng < -101.5 ? M : C;
    case 'SD': return lng < -100.5 ? M : C;
    case 'ND': return lng < -101.0 && lat < 47.4 ? M : C;
    case 'ID': return lat > 45.5 ? P : 'America/Boise';
    case 'OR': return lng > -117.7 && lat < 44.6 ? 'America/Boise' : P;
    default: return BY_STATE[state] || (lng < -114.5 ? P : lng < -102 ? M : lng < -87 ? C : E);
  }
}

// The day and minute of the day in a time zone: { day: 'mon', min: 1092 }.
const formats = new Map();
export function nowIn(zone, date = new Date()) {
  if (!formats.has(zone)) {
    formats.set(zone, new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false }));
  }
  const parts = formats.get(zone).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t).value;
  const day = get('weekday').slice(0, 3).toLowerCase();
  return { day: DAYS.includes(day) ? day : 'mon', min: (Number(get('hour')) % 24) * 60 + Number(get('minute')) };
}
