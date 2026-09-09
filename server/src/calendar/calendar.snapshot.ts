import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { calendarConfig } from '../config/configuration';
import type { CalendarEvent } from './calendar.types';

export type Snapshot = {
  capturedAt: string;
  source: string;
  events: CalendarEvent[];
};

/**
 * Last-known-good persistence for the calendar window.
 *
 * ForexFactory sits behind Cloudflare, so a scrape can fail for reasons that
 * have nothing to do with this service — a challenge escalation, an egress
 * policy, a cold profile. Without a snapshot every such failure would drop the
 * app back to the JSON mirror, which publishes no `actual` values, and already
 * released numbers would visibly regress to "pending".
 *
 * Writing each good scrape to disk means a restart comes up warm and a blocked
 * scrape degrades to stale-but-correct instead of wrong.
 */
@Injectable()
export class CalendarSnapshot {
  private readonly logger = new Logger(CalendarSnapshot.name);
  private readonly path: string;
  private readonly seedPath: string;

  constructor(
    @Inject(calendarConfig.KEY)
    private readonly config: ConfigType<typeof calendarConfig>,
  ) {
    this.path = resolve(process.cwd(), this.config.snapshot.path);
    this.seedPath = resolve(process.cwd(), this.config.snapshot.seedPath);
  }

  /** Prefer the runtime cache; fall back to the checked-in seed on a first run. */
  async load(): Promise<Snapshot | null> {
    if (!this.config.snapshot.enabled) return null;
    return (await this.read(this.path, 'cache')) ?? (await this.read(this.seedPath, 'seed'));
  }

  private async read(path: string, kind: 'cache' | 'seed'): Promise<Snapshot | null> {
    try {
      const snapshot = JSON.parse(await readFile(path, 'utf8')) as Snapshot;
      if (!Array.isArray(snapshot?.events)) throw new Error('malformed snapshot');
      this.logger.log(
        `restored ${snapshot.events.length} events from ${kind} (captured ${snapshot.capturedAt} via ${snapshot.source})`,
      );
      return snapshot;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') this.logger.warn(`${kind} snapshot unreadable: ${error}`);
      return null;
    }
  }

  /** Atomic write, so a crash mid-save cannot leave a truncated snapshot behind. */
  async save(snapshot: Snapshot): Promise<void> {
    if (!this.config.snapshot.enabled) return;
    try {
      await mkdir(dirname(this.path), { recursive: true });
      const temporary = `${this.path}.tmp`;
      await writeFile(temporary, JSON.stringify(snapshot, null, 2), 'utf8');
      await rename(temporary, this.path);
    } catch (error) {
      this.logger.warn(`snapshot save failed: ${error}`);
    }
  }
}
