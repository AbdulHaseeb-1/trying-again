import assert from 'node:assert/strict';
import { SchedulerRegistry } from '@nestjs/schedule';
import { after, test } from 'node:test';

import { CalendarScheduler } from '../src/calendar/calendar.scheduler';
import type { CalendarService } from '../src/calendar/calendar.service';
import type { CalendarConfig } from '../src/config/configuration';
import type { CalendarEvent, SyncTrigger } from '../src/calendar/calendar.types';

const config = (overrides: Partial<CalendarConfig['watch']> = {}): CalendarConfig =>
  ({
    refreshIntervalMs: 60_000,
    watch: {
      enabled: true,
      leadMs: 0,
      pollIntervalMs: 20,
      maxDurationMs: 2_000,
      minImpact: 'low',
      horizonMs: 60_000,
      ...overrides,
    },
  }) as CalendarConfig;

const pendingEvent = (scheduledAt: Date): CalendarEvent => ({
  id: 'cpi',
  sourceId: 1,
  title: 'CPI y/y',
  currency: 'USD',
  country: 'US',
  impact: 'high',
  scheduledAt: scheduledAt.toISOString(),
  timePrecision: 'exact',
  actual: null,
  forecast: '2.8%',
  previous: '2.7%',
  revision: null,
  outcome: 'pending',
  released: false,
  leaked: false,
  source: 'forex-factory-scrape',
  updatedAt: new Date().toISOString(),
  detailUrl: null,
});

/**
 * A CalendarService stand-in whose event prints its `actual` only after
 * `releaseAfterSyncs` polls — the real-world shape of a release the burst
 * poller has to wait for.
 */
function stubService(scheduledAt: Date, releaseAfterSyncs: number, count = 1) {
  const state = {
    events: Array.from({ length: count }, (_, index) => ({
      ...pendingEvent(scheduledAt),
      id: count === 1 ? 'cpi' : `cpi-${index}`,
    })),
    syncs: 0,
    triggers: [] as SyncTrigger[],
  };

  const service = {
    async sync(trigger: SyncTrigger) {
      state.syncs += 1;
      state.triggers.push(trigger);
      if (state.syncs >= releaseAfterSyncs) {
        state.events = state.events.map((event) => ({
          ...event,
          actual: '2.9%',
          outcome: 'worse' as const,
          released: true,
        }));
      }
      return { ok: true } as never;
    },
    async restore() {
      return 0;
    },
    query: () => state.events,
    pendingReleases: () => state.events.filter((event) => !event.released),
  } as unknown as CalendarService;

  return { service, state, get event() { return state.events[0]; } };
}

/**
 * Wait for a condition instead of sleeping a fixed amount. These tests drive
 * real timers, so a fixed sleep is a race against whatever else the machine is
 * doing; polling keeps them fast when idle and correct under load.
 */
async function waitFor(
  predicate: () => boolean,
  { timeoutMs = 5_000, describe = 'condition' } = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`timed out after ${timeoutMs}ms waiting for ${describe}`);
}

const registries: SchedulerRegistry[] = [];
const build = (service: CalendarService, cfg: CalendarConfig) => {
  const registry = new SchedulerRegistry();
  registries.push(registry);
  return new CalendarScheduler(service, registry, cfg);
};

after(() => {
  for (const registry of registries) {
    for (const [, timer] of registry.getIntervals().map((n) => [n, registry.getInterval(n)] as const)) {
      clearInterval(timer);
    }
  }
});

test('a watch armed for an upcoming release polls until the actual prints', async () => {
  // Scheduled 60ms out so the timer fires inside the test.
  const { service, state } = stubService(new Date(Date.now() + 60), 3);
  const scheduler = build(service, config());

  await scheduler.onApplicationBootstrap();
  scheduler.onSynced({ ok: true } as never);

  const armed = scheduler.watchStates;
  assert.equal(armed.length, 1, 'the pending high-impact release should be armed');
  assert.equal(armed[0].phase, 'armed');

  await waitFor(() => scheduler.watchStates[0]?.phase === 'resolved', {
    describe: 'the watch to resolve once the actual lands',
  });

  const [watch] = scheduler.watchStates;
  assert.equal(watch.phase, 'resolved');
  assert.ok(watch.attempts >= 3, `expected repeated polls, saw ${watch.attempts}`);
  assert.ok(
    state.triggers.filter((t) => t === 'release-watch').length >= 3,
    'each burst poll must sync with the release-watch trigger',
  );
  assert.equal(state.events[0].released, true);

  scheduler.onModuleDestroy();
});

test('a release that never prints expires instead of polling forever', async () => {
  const { service } = stubService(new Date(Date.now() + 60), Number.POSITIVE_INFINITY);
  const scheduler = build(service, config({ maxDurationMs: 150, pollIntervalMs: 20 }));

  await scheduler.onApplicationBootstrap();
  scheduler.onSynced({ ok: true } as never);
  await waitFor(() => scheduler.watchStates[0]?.phase === 'expired', {
    describe: 'the watch to expire when nothing prints',
  });

  const [watch] = scheduler.watchStates;
  assert.equal(watch.phase, 'expired');
  assert.ok(watch.attempts >= 1);

  scheduler.onModuleDestroy();
});

test('the scheduler asks for pending releases using its configured horizon', async () => {
  const { service } = stubService(new Date(Date.now() + 10 * 60_000), 1);
  const calls: Array<[number, string]> = [];
  (service as unknown as { pendingReleases: (h: number, i: string) => unknown[] }).pendingReleases = (
    horizonMs,
    minImpact,
  ) => {
    calls.push([horizonMs, minImpact]);
    return [];
  };
  const scheduler = build(service, config({ horizonMs: 1_000, minImpact: 'medium' }));

  await scheduler.onApplicationBootstrap();
  scheduler.onSynced({ ok: true } as never);

  assert.deepEqual(calls.at(-1), [1_000, 'medium']);
  assert.equal(scheduler.watchStates.length, 0);
  scheduler.onModuleDestroy();
});

test('the base refresh interval is retunable at runtime', async () => {
  const { service } = stubService(new Date(Date.now() + 10 * 60_000), 1);
  const scheduler = build(service, config());

  await scheduler.onApplicationBootstrap();
  assert.equal(scheduler.refreshIntervalMs, 60_000);

  scheduler.setRefreshInterval(15_000);
  assert.equal(scheduler.refreshIntervalMs, 15_000);

  scheduler.onModuleDestroy();
});


test('simultaneous releases share one poll loop instead of multiplying the request rate', async () => {
  // Four US numbers dropping on the same 12:30 tick is the ordinary case; each
  // one having its own poller is how you earn an HTTP 429 mid-release.
  const { service, state } = stubService(new Date(Date.now() + 60), 4, 4);
  const scheduler = build(service, config({ pollIntervalMs: 40, maxDurationMs: 2_000 }));

  await scheduler.onApplicationBootstrap();
  scheduler.onSynced({ ok: true } as never);
  assert.equal(scheduler.watchStates.length, 4, 'all four releases should be armed');

  await waitFor(
    () => scheduler.watchStates.every((watch) => watch.phase === 'resolved'),
    { describe: 'all four watches to resolve' },
  );

  const watches = scheduler.watchStates;

  const bursts = state.triggers.filter((trigger) => trigger === 'release-watch').length;
  const ticks = Math.max(...watches.map((watch) => watch.attempts));

  // The four timers can fire on slightly different ticks, so individual watches
  // may record one poll fewer. What must hold is that the sync count tracks the
  // number of *ticks* and not the number of watches: a per-watch poller would
  // have issued roughly `4 * ticks` requests here, which is what earned an
  // HTTP 429 from the upstream feed in practice.
  assert.ok(
    bursts <= ticks + 1,
    `expected about one sync per tick, saw ${bursts} syncs for ${ticks} ticks`,
  );
  assert.ok(
    bursts < 2 * ticks,
    `sync count is scaling with the number of watches (${bursts} syncs, ${ticks} ticks, 4 watches)`,
  );

  scheduler.onModuleDestroy();
});
