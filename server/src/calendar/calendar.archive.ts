import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import type { CalendarEvent, Impact, TimePrecision, ActualOutcome } from './calendar.types';
import { impactRank, IMPACT_ORDER } from './calendar.types';

export type ArchiveQuery = {
  from?: Date;
  to?: Date;
  currencies?: string[];
  minImpact?: Impact;
  /** Only events that have already printed. */
  releasedOnly?: boolean;
  limit?: number;
  cursor?: number;
};

const MAX_LIMIT = 1_000;

/**
 * The calendar's long memory.
 *
 * The live window is two days back — after that an event falls out of memory
 * and, without this, out of existence: ForexFactory's own history is behind a
 * scrape, and the JSON snapshot only ever holds the current window. Every row
 * the store actually changed is written here, so the archive accumulates the
 * calendar as it was observed, including the moment each number printed.
 */
@Injectable()
export class CalendarArchive {
  private readonly logger = new Logger(CalendarArchive.name);

  constructor(private readonly prisma: PrismaService) {}

  get enabled(): boolean {
    return this.prisma.enabled;
  }

  /**
   * Persist the rows a sync changed.
   *
   * `releasedAt` is never part of an update: it marks the first time a number
   * was seen, and ForexFactory revising that number is not a second print.
   * Rows that print while we are watching get stamped by `markReleased`.
   */
  async persist(events: CalendarEvent[]): Promise<number> {
    const db = this.prisma.db;
    if (!db || events.length === 0) return 0;

    try {
      const now = new Date();
      await db.$transaction(
        events.map((event) => {
          const row = {
            sourceId: event.sourceId,
            title: event.title,
            currency: event.currency,
            country: event.country,
            impact: event.impact,
            scheduledAt: new Date(event.scheduledAt),
            timePrecision: event.timePrecision,
            actual: event.actual,
            forecast: event.forecast,
            previous: event.previous,
            revision: event.revision,
            outcome: event.outcome,
            released: event.released,
            leaked: event.leaked,
            source: event.source,
            detailUrl: event.detailUrl,
            updatedAt: new Date(event.updatedAt),
          };
          return db.calendarEvent.upsert({
            where: { id: event.id },
            // A row first seen already-printed is stamped now; that is the
            // earliest moment this service can honestly claim to have seen it.
            create: { id: event.id, ...row, releasedAt: event.released ? now : null },
            update: row,
          });
        }),
      );
      return events.length;
    } catch (error) {
      // Archiving must never fail a sync: the live window is what users read.
      this.logger.warn(`archive write failed: ${error instanceof Error ? error.message : error}`);
      return 0;
    }
  }

  /** Stamp the print time on rows that have just gained an `actual`. */
  async markReleased(ids: string[]): Promise<void> {
    const db = this.prisma.db;
    if (!db || ids.length === 0) return;
    try {
      await db.calendarEvent.updateMany({
        where: { id: { in: ids }, releasedAt: null },
        data: { releasedAt: new Date() },
      });
    } catch (error) {
      this.logger.warn(`release stamp failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  /** Read history back out, in the same shape the live endpoints serve. */
  async query(query: ArchiveQuery = {}): Promise<CalendarEvent[]> {
    const db = this.prisma.db;
    if (!db) return [];

    const impacts = query.minImpact
      ? IMPACT_ORDER.filter((impact) => impactRank(impact) >= impactRank(query.minImpact!))
      : undefined;

    const rows = await db.calendarEvent.findMany({
      where: {
        scheduledAt: query.from || query.to ? { gte: query.from, lte: query.to } : undefined,
        currency: query.currencies?.length
          ? { in: query.currencies.map((code) => code.toUpperCase()) }
          : undefined,
        impact: impacts ? { in: [...impacts] } : undefined,
        released: query.releasedOnly ? true : undefined,
      },
      orderBy: { scheduledAt: 'asc' },
      take: Math.min(query.limit ?? 500, MAX_LIMIT),
      skip: query.cursor ?? 0,
    });

    return rows.map(toDomain);
  }

  /** What the archive holds, for `/status`. */
  async summary(): Promise<{
    events: number;
    released: number;
    earliest: string | null;
    latest: string | null;
  } | null> {
    const db = this.prisma.db;
    if (!db) return null;
    try {
      const [events, released, first, last] = await Promise.all([
        db.calendarEvent.count(),
        db.calendarEvent.count({ where: { released: true } }),
        db.calendarEvent.findFirst({ orderBy: { scheduledAt: 'asc' }, select: { scheduledAt: true } }),
        db.calendarEvent.findFirst({ orderBy: { scheduledAt: 'desc' }, select: { scheduledAt: true } }),
      ]);
      return {
        events,
        released,
        earliest: first?.scheduledAt.toISOString() ?? null,
        latest: last?.scheduledAt.toISOString() ?? null,
      };
    } catch (error) {
      this.logger.warn(`archive summary failed: ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }
}

type CalendarEventRow = {
  id: string;
  sourceId: number | null;
  title: string;
  currency: string;
  country: string;
  impact: string;
  scheduledAt: Date;
  timePrecision: string;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
  revision: string | null;
  outcome: string;
  released: boolean;
  leaked: boolean;
  source: string;
  detailUrl: string | null;
  updatedAt: Date;
};

/** Rows come back as the domain type, so callers cannot tell live from stored. */
export function toDomain(row: CalendarEventRow): CalendarEvent {
  return {
    id: row.id,
    sourceId: row.sourceId,
    title: row.title,
    currency: row.currency,
    country: row.country,
    impact: row.impact as Impact,
    scheduledAt: row.scheduledAt.toISOString(),
    timePrecision: row.timePrecision as TimePrecision,
    actual: row.actual,
    forecast: row.forecast,
    previous: row.previous,
    revision: row.revision,
    outcome: row.outcome as ActualOutcome,
    released: row.released,
    leaked: row.leaked,
    source: row.source as CalendarEvent['source'],
    updatedAt: row.updatedAt.toISOString(),
    detailUrl: row.detailUrl,
  };
}
