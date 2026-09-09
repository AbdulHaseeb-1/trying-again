import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildEventId,
  cleanValue,
  hasMaterialChange,
  mergeEvent,
  normalizeImpact,
  normalizeOutcome,
} from '../src/calendar/calendar.mapper';
import { CalendarStore } from '../src/calendar/calendar.store';
import type { CalendarEvent } from '../src/calendar/calendar.types';

const at = (iso: string) => new Date(iso);

const event = (overrides: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: 'e1',
  sourceId: 1,
  title: 'CPI y/y',
  currency: 'USD',
  country: 'US',
  impact: 'high',
  scheduledAt: '2026-09-10T12:30:00.000Z',
  timePrecision: 'exact',
  actual: null,
  forecast: '2.8%',
  previous: '2.7%',
  revision: null,
  outcome: 'pending',
  released: false,
  leaked: false,
  source: 'forex-factory-scrape',
  updatedAt: '2026-09-09T10:00:00.000Z',
  detailUrl: null,
  ...overrides,
});

test('event ids are stable across sources and unstable across days', () => {
  const a = buildEventId({ title: 'CPI y/y', currency: 'USD', scheduledAt: at('2026-09-10T12:30:00Z') });
  const b = buildEventId({ title: 'CPI  y/y ', currency: 'USD', scheduledAt: at('2026-09-10T18:00:00Z') });
  const c = buildEventId({ title: 'CPI y/y', currency: 'USD', scheduledAt: at('2026-09-11T12:30:00Z') });
  assert.equal(a, b, 'same day + title + currency must collapse to one id');
  assert.notEqual(a, c, 'a different day is a different release');
});

test('impact normalization covers every label ForexFactory emits', () => {
  assert.equal(normalizeImpact('High Impact Expected'), 'high');
  assert.equal(normalizeImpact('Medium Impact Expected'), 'medium');
  assert.equal(normalizeImpact('Low Impact Expected'), 'low');
  assert.equal(normalizeImpact('Non-Economic'), 'holiday');
  assert.equal(normalizeImpact(undefined), 'low');
});

test('empty-ish cells normalize to null', () => {
  assert.equal(cleanValue(''), null);
  assert.equal(cleanValue(' '), null);
  assert.equal(cleanValue('-'), null);
  assert.equal(cleanValue(' 2.8% '), '2.8%');
});

test('outcome stays pending until a number prints', () => {
  assert.equal(normalizeOutcome(1, null), 'pending');
  assert.equal(normalizeOutcome(1, '2.9%'), 'better');
  assert.equal(normalizeOutcome(2, '2.9%'), 'worse');
  assert.equal(normalizeOutcome(0, '2.9%'), 'inline');
});

test('a released actual is never rolled back to pending', () => {
  const stored = event({ actual: '2.9%', outcome: 'worse', released: true });
  const blanked = event({ actual: null, outcome: 'pending', released: false, updatedAt: 'later' });
  const merged = mergeEvent(stored, blanked);
  assert.equal(merged.actual, '2.9%');
  assert.equal(merged.released, true);
  assert.equal(merged.outcome, 'worse');
});

test('updatedAt only moves when a value actually changed', () => {
  const stored = event();
  const identical = event({ updatedAt: '2026-09-09T11:00:00.000Z' });
  assert.equal(mergeEvent(stored, identical).updatedAt, stored.updatedAt);

  const changed = event({ forecast: '3.0%', updatedAt: '2026-09-09T11:00:00.000Z' });
  assert.equal(mergeEvent(stored, changed).updatedAt, '2026-09-09T11:00:00.000Z');
  assert.equal(hasMaterialChange(stored, changed), true);
});

test('store reports the transition to released exactly once', () => {
  const store = new CalendarStore();
  const window = { from: at('2026-09-08T00:00:00Z'), to: at('2026-09-16T00:00:00Z') };

  const first = store.merge([event()], window);
  assert.deepEqual([first.added, first.updated, first.released.length], [1, 0, 0]);

  const printed = store.merge(
    [event({ actual: '2.9%', outcome: 'worse', released: true, updatedAt: 'x' })],
    window,
  );
  assert.deepEqual(printed.released, ['e1']);

  const again = store.merge(
    [event({ actual: '2.9%', outcome: 'worse', released: true, updatedAt: 'y' })],
    window,
  );
  assert.deepEqual(again.released, [], 'a re-read of the same value is not a new release');
  assert.equal(again.updated, 0);
});

test('a partial source result cannot blank events outside its own window', () => {
  const store = new CalendarStore();
  const wide = { from: at('2026-09-01T00:00:00Z'), to: at('2026-09-30T00:00:00Z') };
  store.merge([event({ id: 'a' }), event({ id: 'b', scheduledAt: '2026-09-20T12:00:00.000Z' })], wide);

  const narrow = { from: at('2026-09-10T00:00:00Z'), to: at('2026-09-11T00:00:00Z') };
  const report = store.merge([event({ id: 'a' })], narrow);
  assert.equal(report.removed, 0, 'b is outside the covered window and must survive');
  assert.equal(store.size, 2);
});

test('prune drops events that fell out of the retention window', () => {
  const store = new CalendarStore();
  const wide = { from: at('2026-09-01T00:00:00Z'), to: at('2026-09-30T00:00:00Z') };
  store.merge([event({ id: 'a' }), event({ id: 'b', scheduledAt: '2026-09-20T12:00:00.000Z' })], wide);
  const removed = store.prune({ from: at('2026-09-09T00:00:00Z'), to: at('2026-09-12T00:00:00Z') });
  assert.equal(removed, 1);
  assert.equal(store.size, 1);
});
