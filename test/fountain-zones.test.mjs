import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zoneOf, nowIn } from '../fountain/js/zones.js';

test('places keep their own clock', () => {
  assert.equal(zoneOf('DC', -77.03, 38.9), 'America/New_York');
  assert.equal(zoneOf('CA', -118.24, 34.05), 'America/Los_Angeles');
  assert.equal(zoneOf('AZ', -112.07, 33.45), 'America/Phoenix');
  assert.equal(zoneOf('TX', -97.74, 30.27), 'America/Chicago', 'Austin');
  assert.equal(zoneOf('TX', -106.44, 31.76), 'America/Denver', 'El Paso');
  assert.equal(zoneOf('FL', -87.22, 30.42), 'America/Chicago', 'Pensacola');
  assert.equal(zoneOf('FL', -80.19, 25.76), 'America/New_York', 'Miami');
  assert.equal(zoneOf('TN', -86.78, 36.16), 'America/Chicago', 'Nashville');
  assert.equal(zoneOf('TN', -83.92, 35.96), 'America/New_York', 'Knoxville');
  assert.equal(zoneOf('ID', -116.2, 43.6), 'America/Boise');
  assert.equal(zoneOf('ID', -116.78, 47.68), 'America/Los_Angeles', "Coeur d'Alene");
});

test('the time in a zone', () => {
  const noonUTC = new Date('2026-11-20T17:00:00Z');
  assert.deepEqual(nowIn('America/New_York', noonUTC), { day: 'fri', min: 12 * 60 });
  assert.deepEqual(nowIn('America/Los_Angeles', noonUTC), { day: 'fri', min: 9 * 60 });
  assert.deepEqual(nowIn('Pacific/Honolulu', new Date('2026-11-21T05:00:00Z')), { day: 'fri', min: 19 * 60 });
});
