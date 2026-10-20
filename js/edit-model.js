// Shared by the site and the edits server: what a visitor edit looks like,
// how it's checked, and how it changes a bar.
import { DAYS } from './time.js';

export const CATEGORIES = ['beer', 'wine', 'cocktail', 'spirits', 'food', 'other'];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_ROWS = 12;
const MAX_TEXT = 120;

// Turns what someone typed in the price box into the crawl's deal shape.
export function parsePrice(input) {
  const s = String(input ?? '').trim();
  if (!s) return { price: null, kind: null };
  let m;
  if ((m = s.match(/^\$?\s*(\d+(?:\.\d{1,2})?)$/))) return { price: Number(m[1]), kind: 'flat_price' };
  if ((m = s.match(/^\$\s*(\d+(?:\.\d{1,2})?)\s*off\b/i))) return { price: Number(m[1]), kind: 'dollars_off' };
  if ((m = s.match(/^(\d{1,3})\s*%\s*off\b/i))) return { price: Number(m[1]), kind: 'percent_off' };
  if (/^half\b|^50\s*%/i.test(s)) return { price: null, kind: 'half_off' };
  if (/bogo|buy one|2\s*for\s*1|two for one/i.test(s)) return { price: null, kind: 'bogo' };
  if (/^free\b/i.test(s)) return { price: null, kind: 'free' };
  return { price: null, kind: null, price_text: s.slice(0, 40) };
}

const text = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);

function cleanWindow(w) {
  const days = DAYS.filter((d) => Array.isArray(w?.days) && w.days.includes(d));
  if (!days.length) return { error: 'Pick at least one day for each time slot.' };
  const endLabel = w.end_label === 'close' || w.end_label === 'all day' ? w.end_label : null;
  if (endLabel === 'all day') return { days, start: null, end: null, end_label: 'all day', area: text(w.area) || null };
  if (!TIME.test(w.start || '')) return { error: 'Each time slot needs a start time.' };
  if (!endLabel && !TIME.test(w.end || '')) return { error: 'Each time slot needs an end time, or "until close".' };
  return { days, start: w.start, end: endLabel ? null : w.end, end_label: endLabel, area: text(w.area) || null };
}

function cleanDeal(d) {
  const category = CATEGORIES.includes(d?.category) ? d.category : 'other';
  const item = text(d?.item);
  const priced = parsePrice(d?.price);
  if (!item && !priced.kind && !priced.price_text) return null;
  const deal = { category, item: item || null, price: priced.price, kind: priced.kind, text: [item, d?.price].filter(Boolean).join(' ').slice(0, MAX_TEXT) };
  if (priced.price_text) deal.price_text = priced.price_text;
  return deal;
}

function cleanUrl(u) {
  const s = String(u ?? '').trim();
  if (!s) return '';
  try {
    const url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch { return ''; }
}

// Returns { edit } or { error }. hasPhoto says whether a photo came with it,
// since a link or a photo is the one thing every edit must have.
export function validateEdit(input, { hasPhoto = false } = {}) {
  const venueId = text(input?.venue_id);
  if (!venueId) return { error: 'Missing which bar this is for.' };
  const sourceUrl = cleanUrl(input.source_url);
  if (input.source_url && !sourceUrl) return { error: 'That source link doesn\'t look like a web address.' };
  if (!sourceUrl && !hasPhoto) return { error: 'Add a link or a photo of the menu so people know where this came from.' };
  const noHappyHour = input.no_happy_hour === true || input.no_happy_hour === 'true';
  const windows = [];
  const deals = [];
  if (!noHappyHour) {
    for (const w of (input.windows || []).slice(0, MAX_ROWS)) {
      const c = cleanWindow(w);
      if (c.error) return c;
      windows.push(c);
    }
    for (const d of (input.deals || []).slice(0, MAX_ROWS * 2)) {
      const c = cleanDeal(d);
      if (c) deals.push(c);
    }
    if (!windows.length) return { error: 'Add at least one day and time, or tick "No happy hour anymore".' };
  }
  return {
    edit: {
      venue_id: venueId,
      no_happy_hour: noHappyHour,
      windows,
      deals,
      source_url: sourceUrl || null,
      staff: input.staff === true || input.staff === 'true',
      note: text(input.note) || null
    }
  };
}

// Applies the newest visitor edit to a bar, unless the crawl checked the bar
// more recently than the edit was made. restored_original means "go back to
// the crawl's version".
export function applyEdit(venue, edit) {
  if (!edit || edit.restored_original) return venue;
  const editedOn = String(edit.created_at || '').slice(0, 10);
  if (venue.crawlVerified && editedOn && venue.crawlVerified > editedOn) return venue;
  return {
    ...venue,
    windows: edit.windows || [],
    deals: edit.deals || [],
    noHappyHour: !!edit.no_happy_hour,
    verified: editedOn || venue.verified,
    sourceUrl: edit.source_url || edit.photo_url || '',
    sourceDate: '',
    summary: '',
    confidence: '',
    edit: { id: edit.id, at: edit.created_at, staff: !!edit.staff, photo: edit.photo_url || null, link: edit.source_url || null }
  };
}
