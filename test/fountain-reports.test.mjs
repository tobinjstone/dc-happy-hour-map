import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateReport, validatePlace, summarize, parsePrice } from '../fountain/js/report-model.js';

test('a good report is cleaned up', () => {
  const { report, error } = validateReport({ place_id: 'mcdonalds-123', status: 'pouring', fizz: '5', price: '$1.29', tags: ['freestyle', 'bogus'], note: '  so   crisp ' });
  assert.equal(error, undefined);
  assert.deepEqual(report, { place_id: 'mcdonalds-123', status: 'pouring', fizz: 5, price: 1.29, tags: ['freestyle'], note: 'so crisp' });
});

test('reports are checked', () => {
  assert.match(validateReport({ status: 'pouring' }).error, /which place/);
  assert.match(validateReport({ place_id: 'x', status: 'meh' }).error, /how it went/);
  assert.match(validateReport({ place_id: 'x', status: 'pouring', fizz: 7 }).error, /1 to 5/);
  assert.match(validateReport({ place_id: 'x', status: 'pouring', price: 'cheap' }).error, /Price/);
  assert.equal(validateReport({ place_id: 'x', status: 'out', fizz: 4 }).report.fizz, null, 'no rating when there was nothing to drink');
  assert.equal(parsePrice('50'), undefined);
  assert.equal(parsePrice(''), null);
});

test('added spots need a name and a pin in the area', () => {
  assert.ok(validatePlace({ name: "Joe's Pizza", lat: 38.9, lng: -77.03 }).place);
  assert.match(validatePlace({ name: 'J', lat: 38.9, lng: -77.03 }).error, /name/);
  assert.ok(validatePlace({ name: 'Anchorage Diner', lat: 61.2, lng: -149.9 }).place, 'anywhere in the US');
  assert.match(validatePlace({ name: 'Faraway', lat: 51.5, lng: -0.12 }).error, /pin/);
});

const now = Date.parse('2026-11-13T18:00:00Z');
const daysAgo = (d) => new Date(now - d * 86400000).toISOString();

test('the newest report that is still fresh sets the status', () => {
  const s = summarize([
    { status: 'out', created_at: daysAgo(5) },
    { status: 'pouring', fizz: 4, created_at: daysAgo(10), tags: ['freestyle'] },
    { status: 'pouring', fizz: 5, created_at: daysAgo(20), price: 1.09, tags: ['freestyle', 'free_refills'] }
  ], now);
  assert.equal(s.status, 'pouring', 'an outage from five days ago has probably been fixed');
  assert.equal(s.fizz, 4.5);
  assert.equal(s.rated, 2);
  assert.equal(s.count, 3);
  assert.deepEqual(s.tags, { freestyle: 2, free_refills: 1 });
  assert.equal(s.price, 1.09);
  assert.equal(summarize([{ status: 'out', created_at: daysAgo(0.5) }, { status: 'pouring', created_at: daysAgo(3) }], now).status, 'out');
  assert.equal(summarize([{ status: 'pouring', created_at: daysAgo(90) }], now).status, null);
  assert.equal(summarize([], now).latest, null);
});
