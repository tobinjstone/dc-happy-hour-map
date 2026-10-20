import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statusAt, fmtDays, fmtWindowTime } from '../js/time.js';
import { linesFor } from '../js/lines.js';

const weekday = [{ days: ['mon', 'tue', 'wed', 'thu', 'fri'], start: '16:00', end: '19:00' }];

test('live during a window, with minutes left', () => {
  const s = statusAt(weekday, { day: 'mon', min: 18 * 60 + 12 });
  assert.equal(s.status, 'live');
  assert.equal(s.minsLeft, 48);
});

test('soon within the hour, later beyond it', () => {
  assert.equal(statusAt(weekday, { day: 'mon', min: 15 * 60 + 30 }).status, 'soon');
  assert.equal(statusAt(weekday, { day: 'mon', min: 12 * 60 }).status, 'later');
});

test('ended after the window, off on days without one', () => {
  assert.equal(statusAt(weekday, { day: 'mon', min: 20 * 60 }).status, 'ended');
  assert.equal(statusAt(weekday, { day: 'sat', min: 17 * 60 }).status, 'off');
});

test('until-close windows run past midnight into the next day', () => {
  const late = [{ days: ['fri'], start: '22:00', end: null, end_label: 'close' }];
  assert.equal(statusAt(late, { day: 'fri', min: 23 * 60 }).status, 'live');
  const s = statusAt(late, { day: 'sat', min: 60 });
  assert.equal(s.status, 'live');
  assert.equal(s.minsLeft, 60);
  assert.equal(statusAt(late, { day: 'sat', min: 3 * 60 }).status, 'off');
});

test('formats days and times', () => {
  assert.equal(fmtDays(['mon', 'tue', 'wed', 'thu', 'fri']), 'Mon–Fri');
  assert.equal(fmtDays(['sat', 'sun']), 'Sat, Sun');
  assert.equal(fmtDays(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']), 'Every day');
  assert.equal(fmtWindowTime({ start: '16:00', end: '19:00' }), '4 pm–7 pm');
  assert.equal(fmtWindowTime({ start: '22:00', end: null, end_label: 'close' }), '10 pm–close');
});

test('lines come from deal categories and late windows', () => {
  const v = { deals: [{ category: 'beer' }, { category: 'spirits' }, { category: 'food' }], windows: [{ start: '22:00' }] };
  assert.deepEqual(linesFor(v), ['beer', 'cocktail', 'late']);
});

test('formats last-checked dates and ages', async () => {
  const { fmtDate, daysSince, fmtAge } = await import('../js/time.js');
  assert.equal(fmtDate('2026-10-12'), 'Oct 12, 2026');
  assert.equal(fmtDate('nope'), '');
  assert.equal(daysSince('2026-10-12', new Date(2026, 9, 19, 18)), 7);
  assert.equal(fmtAge(0), 'today');
  assert.equal(fmtAge(7), '7 days ago');
  assert.equal(fmtAge(90), '3 months ago');
});

test('handles windows with missing or partial times', () => {
  const allDay = [{ days: ['mon'], start: null, end: null, end_label: 'all day' }];
  assert.equal(statusAt(allDay, { day: 'mon', min: 9 * 60 }).status, 'live');
  const noEnd = [{ days: ['mon'], start: '16:00', end: null, end_label: null }];
  const s = statusAt(noEnd, { day: 'mon', min: 17 * 60 });
  assert.equal(s.status, 'live');
  assert.equal(s.endKnown, false);
  assert.equal(fmtWindowTime(noEnd[0]), 'From 4 pm');
  assert.equal(statusAt([{ days: ['mon'], start: null, end: null, end_label: null }], { day: 'mon', min: 600 }).status, 'unknown');
  assert.equal(statusAt([], { day: 'mon', min: 600 }).status, 'unknown');
  assert.equal(statusAt([{ days: [], start: '16:00', end: '19:00' }], { day: 'mon', min: 1000 }).status, 'unknown');
  const overnight = [{ days: ['fri'], start: '22:00', end: '01:00' }];
  assert.equal(statusAt(overnight, { day: 'sat', min: 30 }).status, 'live');
});

test('all-day windows are flagged and stay off the late-night line', () => {
  const allDay = [{ days: ['mon'], start: null, end: null, end_label: 'all day' }];
  assert.equal(statusAt(allDay, { day: 'mon', min: 18 * 60 }).allDay, true);
  assert.equal(statusAt(weekday, { day: 'mon', min: 17 * 60 }).allDay, false);
  assert.deepEqual(linesFor({ deals: [{ category: 'beer' }], windows: allDay }), ['beer']);
});
