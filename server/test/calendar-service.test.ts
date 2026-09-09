import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CalendarService } from '../src/calendar/calendar.service';
import { CalendarStore } from '../src/calendar/calendar.store';
import type { CalendarConfig } from '../src/config/configuration';
import type { CalendarEvent } from '../src/calendar/calendar.types';

const config = {
  pastDays: 2,
  futureDays: 7,
  feed: { enabled: false },
  sourcePolicy: { timeoutMs: 1_000, breakerThreshold: 3, breakerCooldownMs: 1_000 },
} as unknown as CalendarConfig;

const noopSource = { name: 'forex-factory-scrape', priority: 0, fetch: async () => {
  throw new Error('unused');
} };

const build = (events: CalendarEvent[]) => {
  const store = new CalendarStore();
  store.hydrate(events);
  const service = new CalendarService(
    store,
    { load: async () => null, save: async () => undefined } as never,
    { emit: () => true } as never,
    noopSource as never,
    noopSource as never,
    config,
  );
  return service;
};

const event = (overrides: Partial<CalendarEvent>): CalendarEvent => ({
  id: Math.random().toString(36).slice(2),
  sourceId: null,
  title: 'Event',
  currency: 'USD',
  country: 'US',
  impact: 'high',
  scheduledAt: new Date(Date.now() + 60_000).toISOString(),
  timePrecision: 'exact',
  actual: null,
  forecast: null,
  previous: null,
  revision: null,
  outcome: 'pending',
  released: false,
  leaked: false,
  source: 'forex-factory-scrape',
  updatedAt: new Date().toISOString(),
  detailUrl: null,
  ...overrides,
});

test('the rolling window spans the configured past and future days', () => {
  const { from, to } = build([]).window();
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000);
  // Start-of-day D-2 through end-of-day D+7 is ten whole calendar days.
  assert.equal(days, 10, '2 days of history + today + 7 days ahead, inclusive');
  assert.equal(from.toISOString().slice(11), '00:00:00.000Z');
  assert.equal(to.toISOString().slice(11), '23:59:59.999Z');
  assert.ok(from < new Date() && to > new Date());
});

test('pendingReleases respects the horizon, impact floor and release state', () => {
  const service = build([
    event({ id: 'soon-high' }),
    event({ id: 'soon-low', impact: 'low' }),
    event({ id: 'already-out', actual: '1.0%', released: true }),
    event({ id: 'far-away', scheduledAt: new Date(Date.now() + 10 * 86_400_000).toISOString() }),
    event({ id: 'no-clock', timePrecision: 'all-day' }),
    event({ id: 'in-the-past', scheduledAt: new Date(Date.now() - 60_000).toISOString() }),
  ]);

  const ids = service.pendingReleases(86_400_000, 'medium').map((e) => e.id);
  assert.deepEqual(ids, ['soon-high']);

  const withLow = service.pendingReleases(86_400_000, 'low').map((e) => e.id).sort();
  assert.deepEqual(withLow, ['soon-high', 'soon-low']);
});

test('nextRelease picks the soonest unprinted event and honours the impact floor', () => {
  const service = build([
    event({ id: 'later-high', scheduledAt: new Date(Date.now() + 300_000).toISOString() }),
    event({ id: 'sooner-low', impact: 'low', scheduledAt: new Date(Date.now() + 60_000).toISOString() }),
  ]);
  assert.equal(service.nextRelease()?.id, 'sooner-low');
  assert.equal(service.nextRelease('high')?.id, 'later-high');
});

test('query filters by currency, impact and window', () => {
  const service = build([
    event({ id: 'usd-high', currency: 'USD' }),
    event({ id: 'eur-low', currency: 'EUR', impact: 'low' }),
    event({ id: 'gbp-medium', currency: 'GBP', impact: 'medium' }),
  ]);

  assert.deepEqual(service.query({ currencies: ['usd', 'gbp'] }).map((e) => e.id).sort(), [
    'gbp-medium',
    'usd-high',
  ]);
  assert.deepEqual(service.query({ minImpact: 'medium' }).map((e) => e.id).sort(), [
    'gbp-medium',
    'usd-high',
  ]);
  assert.equal(service.query({ from: new Date(Date.now() + 3_600_000) }).length, 0);
});
