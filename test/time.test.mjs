import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statusAt, fmtDays, fmtWindowTime } from '../js/time.js';
import { linesFor, mstEdges } from '../js/lines.js';

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

test('spanning tree joins every stop', () => {
  const pts = [[0, 0], [1, 0], [2, 0], [0, 1]];
  assert.equal(mstEdges(pts).length, 3);
  assert.deepEqual(mstEdges([[0, 0]]), []);
});
