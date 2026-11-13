import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHours, openAt, openNote, weekRows } from '../fountain/js/hours.js';

const at = (day, h, m = 0) => ({ day, min: h * 60 + m });

test('reads the store-locator formats', () => {
  assert.equal(parseHours('24/7').always, true);
  const h = parseHours('Mo-Th 10:30-22:00; Fr-Sa 10:30-23:00; Su closed');
  assert.deepEqual(h.week[1], [[630, 1320]]);
  assert.deepEqual(h.week[5], [[630, 1380]]);
  assert.deepEqual(h.week[0], []);
  assert.deepEqual(parseHours('Mo-Fr 06:00-10:30,11:00-22:00; Sa-Su 07:00-22:00').week[2], [[360, 630], [660, 1320]]);
  assert.equal(parseHours('Mo-Su 00:00-24:00').always, true);
  assert.equal(parseHours('sometimes'), null);
  assert.equal(parseHours(''), null);
});

test('open, closing soon and closed', () => {
  const h = parseHours('Mo-Su 06:00-23:00');
  assert.deepEqual(openAt(h, at('mon', 12)), { open: true, minsLeft: 660, closesAt: 1380 });
  assert.equal(openNote(openAt(h, at('mon', 22, 30)), at('mon', 22, 30)), 'Closes soon · 11 pm');
  const closed = openAt(h, at('mon', 23, 30));
  assert.equal(closed.open, false);
  assert.equal(openNote(closed, at('mon', 23, 30)), 'Closed · opens tomorrow 6 am');
  assert.equal(openNote(openAt(h, at('mon', 5)), at('mon', 5)), 'Closed · opens 6 am');
});

test('late nights run past midnight into the next day', () => {
  const h = parseHours('Mo-Th 10:00-01:00; Fr-Sa 10:00-03:00; Su 10:00-23:00');
  const fri = openAt(h, at('sat', 2));
  assert.equal(fri.open, true);
  assert.equal(fri.minsLeft, 60);
  assert.equal(openAt(h, at('mon', 0, 30)).open, false, 'Sunday closes at 11 pm');
  assert.equal(openNote(openAt(h, at('tue', 23)), at('tue', 23)), 'Open until 1 am');
});

test('closing at midnight and reopening right away counts as open through', () => {
  const h = parseHours('Mo-Su 05:00-24:00,00:00-01:00');
  const st = openAt(h, at('tue', 23, 30));
  assert.equal(st.open, true);
  assert.equal(st.minsLeft, 90);
  assert.equal(openNote(openAt(parseHours('Mo-Su 10:00-24:00'), at('mon', 21)), at('mon', 21)), 'Open until midnight');
});

test('a closed weekend points to Monday', () => {
  const h = parseHours('Mo-Fr 07:00-15:00');
  const st = openAt(h, at('sat', 12));
  assert.deepEqual(st.opensAt, { day: 'mon', min: 420 });
  assert.equal(openNote(st, at('sat', 12)), 'Closed · opens Mon 7 am');
  assert.equal(openNote(openAt(null, at('sat', 12)), at('sat', 12)), 'Hours not listed');
});

test('the week folds into rows, Monday first', () => {
  assert.deepEqual(weekRows(parseHours('Mo-Th 10:30-22:00; Fr-Sa 10:30-23:00; Su closed')), [
    { days: 'Mon–Thu', hours: '10:30 am–10 pm' },
    { days: 'Fri–Sat', hours: '10:30 am–11 pm' },
    { days: 'Sun', hours: 'Closed' }
  ]);
  assert.deepEqual(weekRows(parseHours('Mo-Su 06:00-24:00')), [{ days: 'Every day', hours: '6 am–midnight' }]);
  assert.deepEqual(weekRows(parseHours('24/7')), [{ days: 'Every day', hours: '24 hours' }]);
  // Late nights as locators write them: the hour after midnight on the next day.
  assert.deepEqual(weekRows(parseHours('Mo-Th 06:00-24:00; Fr-Sa 00:00-01:00,06:00-24:00; Su 00:00-01:00,07:00-22:00')), [
    { days: 'Mon–Wed', hours: '6 am–midnight' },
    { days: 'Thu–Sat', hours: '6 am–1 am' },
    { days: 'Sun', hours: '7 am–10 pm' }
  ]);
});
