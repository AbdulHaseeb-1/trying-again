/**
 * Turn a raw `calendarComponentStates` capture into a calendar snapshot.
 *
 * Useful when a scrape has to be taken from a machine that can reach
 * ForexFactory and the result carried to one that cannot (a CI box, a
 * restricted network). It runs the exact mapper the live scraper uses, so the
 * output is byte-for-byte what a successful scrape would have persisted.
 *
 *   npx tsx scripts/import-snapshot.ts <capture.json> [output.json]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import type { CalendarEvent } from '../src/calendar/calendar.types';
import {
  toCalendarEvent,
  type RawForexFactoryDay,
} from '../src/calendar/sources/forex-factory.mapper';

const [, , inputPath, outputPath = 'data/calendar-snapshot.json'] = process.argv;
if (!inputPath) {
  console.error('usage: tsx scripts/import-snapshot.ts <capture.json> [output.json]');
  process.exit(1);
}

const capture = JSON.parse(readFileSync(resolve(inputPath), 'utf8')) as
  | Record<string, { days?: RawForexFactoryDay[] }>
  | { days?: RawForexFactoryDay[] };

const state = 'days' in capture ? capture : Object.values(capture).find((s) => Array.isArray(s?.days));
const days = state?.days ?? [];
if (!days.length) {
  console.error('capture contained no calendar days');
  process.exit(1);
}

const observedAt = new Date().toISOString();
const events = days
  .flatMap((day) => day.events ?? [])
  .map((raw) => toCalendarEvent(raw, { baseUrl: 'https://www.forexfactory.com', observedAt }))
  .filter((event): event is CalendarEvent => event !== null)
  .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));

const target = resolve(outputPath);
mkdirSync(dirname(target), { recursive: true });
writeFileSync(
  target,
  JSON.stringify({ capturedAt: observedAt, source: 'forex-factory-scrape', events }, null, 2),
);
console.log(`wrote ${events.length} events to ${target}`);
console.log(`  released: ${events.filter((e) => e.released).length}`);
console.log(`  high impact: ${events.filter((e) => e.impact === 'high').length}`);
console.log(`  range: ${events[0]?.scheduledAt} .. ${events.at(-1)?.scheduledAt}`);
