import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { CALENDAR_RELEASED } from '../calendar/calendar.service';
import { NewsService } from './news.service';

const int = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * Keeps the news store warm.
 *
 * Two triggers rather than one: a base interval for the external feeds, and the
 * calendar's own `release` event, so a number that prints at 13:30 is a
 * citeable news item within the same second rather than up to five minutes
 * later. The calendar already does the hard work of noticing; this just listens.
 */
@Injectable()
export class NewsScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(NewsScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private readonly intervalMs = int(process.env.NEWS_REFRESH_INTERVAL_MS, 5 * 60_000);
  private readonly onBoot = (process.env.NEWS_REFRESH_ON_BOOT ?? 'true') !== 'false';

  constructor(private readonly news: NewsService) {}

  onApplicationBootstrap(): void {
    if (this.onBoot) {
      // Deferred so a slow first feed never delays the HTTP listener.
      setTimeout(() => void this.news.sync().catch(() => undefined), 2_000).unref?.();
    }
    this.timer = setInterval(() => void this.news.sync().catch(() => undefined), this.intervalMs);
    this.timer.unref?.();
    this.logger.log(`news refresh every ${Math.round(this.intervalMs / 1000)}s`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  @OnEvent(CALENDAR_RELEASED)
  onCalendarRelease(): void {
    void this.news.sync().catch(() => undefined);
  }
}
