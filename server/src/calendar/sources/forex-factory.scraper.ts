import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { ConstantBackoff, handleAll, retry } from 'cockatiel';
import { DateTime } from 'luxon';

import { BrowserService, type BrowserProfile } from '../../browser/browser.service';
import { calendarConfig } from '../../config/configuration';
import type { CalendarEvent, SourceName } from '../calendar.types';
import type { CalendarSource, FetchWindow, SourceResult } from './calendar-source';
import {
  toCalendarEvent,
  type RawForexFactoryDay,
  type RawForexFactoryEvent,
} from './forex-factory.mapper';

/** The page hydrates this onto `window`; typed here because the server build has no DOM lib. */
type CalendarWindow = {
  calendarComponentStates?: Record<string, { days?: RawForexFactoryDay[] } | undefined>;
};

/**
 * Primary source: drives a real browser at forexfactory.com/calendar.
 *
 * Rather than parsing the table DOM — which changes shape between event types
 * and hides the real timestamp behind a localized label — we read the JSON
 * state the page hydrates itself from. That gives unix datelines, revisions and
 * ForexFactory's own better/worse verdict, none of which survive DOM scraping
 * cleanly.
 */
@Injectable()
export class ForexFactoryScraper implements CalendarSource {
  readonly name: SourceName = 'forex-factory-scrape';
  readonly priority = 0;

  private readonly logger = new Logger(ForexFactoryScraper.name);

  private readonly profile: BrowserProfile;

  constructor(
    private readonly browser: BrowserService,
    @Inject(calendarConfig.KEY)
    private readonly config: ConfigType<typeof calendarConfig>,
  ) {
    const { scraper } = config;
    this.profile = {
      name: 'forex-factory',
      userDataDir: scraper.userDataDir,
      headless: scraper.headless,
      executablePath: scraper.executablePath,
      navigationTimeoutMs: scraper.navigationTimeoutMs,
      idleShutdownMs: scraper.idleShutdownMs,
      proxyServer: scraper.proxyServer,
    };
  }

  /**
   * ForexFactory's range syntax, e.g. `sep7.2026-sep16.2026`.
   * The day must be unpadded: `sep07.2026` is silently rejected and the page
   * then renders an empty calendar rather than returning an error.
   */
  private rangeParam(range: FetchWindow): string {
    const format = (date: Date) =>
      DateTime.fromJSDate(date, { zone: 'utc' }).toFormat('LLLd.yyyy').toLowerCase();
    return `${format(range.from)}-${format(range.to)}`;
  }

  private buildUrl(range: FetchWindow): string {
    return `${this.config.scraper.baseUrl}/calendar?range=${this.rangeParam(range)}`;
  }

  async fetch(range: FetchWindow): Promise<SourceResult> {
    const startedAt = Date.now();
    const policy = retry(handleAll, {
      maxAttempts: Math.max(1, this.config.scraper.retries + 1),
      backoff: new ConstantBackoff(2_000),
    });

    let attempt = 0;
    const raw = await policy.execute(async () => {
      attempt += 1;
      // A stale profile is a common cause of a stuck challenge; start clean on retry.
      if (attempt > 1) await this.browser.recycle(this.profile);
      return this.scrape(range);
    });

    const observedAt = new Date().toISOString();
    const events = raw
      .map((event) => toCalendarEvent(event, { baseUrl: this.config.scraper.baseUrl, observedAt }))
      .filter((event): event is CalendarEvent => event !== null);

    return {
      source: this.name,
      events,
      fetchedAt: observedAt,
      durationMs: Date.now() - startedAt,
    };
  }

  private async scrape(range: FetchWindow): Promise<RawForexFactoryEvent[]> {
    const url = this.buildUrl(range);
    return this.browser.withPage(this.profile, async (page) => {
      this.logger.debug(`GET ${url}`);
      await page.goto(url, { waitUntil: 'domcontentloaded' });

      // Cloudflare serves its interstitial first; the hydrated state only exists
      // on the real page, so waiting for it also waits out the check.
      try {
        await page.waitForFunction(
          () => {
            const states = (globalThis as unknown as CalendarWindow).calendarComponentStates;
            return !!states && Object.values(states).some((state) => Array.isArray(state?.days));
          },
          null,
          { timeout: this.config.scraper.navigationTimeoutMs },
        );
      } catch {
        // Say what we were actually looking at — "timed out" alone cannot
        // distinguish a blocked challenge from a changed page structure.
        const title = await page.title().catch(() => 'unknown');
        const challenged = /just a moment|attention required|checking your browser/i.test(title);
        throw new Error(
          challenged
            ? `blocked by the Cloudflare challenge (page title: "${title}")`
            : `calendar state never hydrated (page title: "${title}")`,
        );
      }

      const days = await page.evaluate(() => {
        const states = (globalThis as unknown as CalendarWindow).calendarComponentStates ?? {};
        const state = Object.values(states).find((candidate) => Array.isArray(candidate?.days));
        return JSON.parse(JSON.stringify(state?.days ?? [])) as RawForexFactoryDay[];
      });

      const events = days.flatMap((day) => day.events ?? []);
      this.logger.log(`scraped ${events.length} events across ${days.length} days`);
      if (!events.length) throw new Error('calendar state contained no events');
      return events;
    });
  }
}
