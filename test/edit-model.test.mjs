import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePrice, validateEdit, applyEdit } from '../js/edit-model.js';

test('reads typed prices into deal kinds', () => {
  assert.deepEqual(parsePrice('$5'), { price: 5, kind: 'flat_price' });
  assert.deepEqual(parsePrice('6.50'), { price: 6.5, kind: 'flat_price' });
  assert.deepEqual(parsePrice('$2 off'), { price: 2, kind: 'dollars_off' });
  assert.deepEqual(parsePrice('20% off'), { price: 20, kind: 'percent_off' });
  assert.equal(parsePrice('Half off').kind, 'half_off');
  assert.equal(parsePrice('2 for 1').kind, 'bogo');
  assert.deepEqual(parsePrice('$1 oysters with drink'), { price: null, kind: null, price_text: '$1 oysters with drink' });
});

const good = {
  venue_id: 'v1',
  windows: [{ days: ['fri', 'mon'], start: '16:00', end: '19:00' }],
  deals: [{ category: 'beer', item: 'Drafts', price: '$5' }, { category: 'wine', item: '', price: '' }],
  source_url: 'barsite.com/menu'
};

test('a valid edit is cleaned up', () => {
  const { edit, error } = validateEdit(good);
  assert.equal(error, undefined);
  assert.deepEqual(edit.windows[0].days, ['mon', 'fri']);
  assert.equal(edit.deals.length, 1);
  assert.equal(edit.deals[0].kind, 'flat_price');
  assert.equal(edit.source_url, 'https://barsite.com/menu');
});

test('every edit needs a link or a photo', () => {
  assert.match(validateEdit({ ...good, source_url: '' }).error, /link or a photo/);
  assert.ok(validateEdit({ ...good, source_url: '' }, { hasPhoto: true }).edit);
  assert.match(validateEdit({ ...good, source_url: 'javascript:alert(1)' }).error, /web address/);
});

test('times are checked, and "no happy hour" needs none', () => {
  assert.match(validateEdit({ ...good, windows: [{ days: ['mon'], start: '16:00' }] }).error, /end time/);
  assert.match(validateEdit({ ...good, windows: [{ days: [], start: '16:00', end: '19:00' }] }).error, /day/);
  assert.ok(validateEdit({ ...good, windows: [{ days: ['sat'], end_label: 'all day' }] }).edit);
  const gone = validateEdit({ ...good, windows: [], no_happy_hour: true }).edit;
  assert.equal(gone.no_happy_hour, true);
  assert.deepEqual(gone.windows, []);
});

test('newest edit replaces the crawl, unless the crawl is newer', () => {
  const venue = { id: 'v1', windows: [], deals: [], crawlVerified: '2026-10-19', verified: '2026-10-19' };
  const edit = { id: 3, ...validateEdit(good).edit, created_at: '2026-10-21T01:00:00Z' };
  const out = applyEdit(venue, edit);
  assert.equal(out.windows.length, 1);
  assert.equal(out.verified, '2026-10-21');
  assert.equal(out.edit.id, 3);
  assert.equal(applyEdit({ ...venue, crawlVerified: '2026-11-01' }, edit).edit, undefined);
  assert.equal(applyEdit(venue, { restored_original: true }), venue);
});
