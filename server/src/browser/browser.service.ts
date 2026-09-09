import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

import { calendarConfig } from '../config/configuration';

/**
 * Owns the single Chromium instance the scraper drives.
 *
 * Two details matter here and are easy to lose:
 *
 * 1. ForexFactory sits behind a Cloudflare interstitial that headless Chromium
 *    never clears. We launch a *headed* browser (run the process under Xvfb on
 *    a server) and persist the profile so the clearance cookie survives polls.
 * 2. Chromium's post-quantum TLS key share breaks TLS-terminating egress
 *    proxies, which surfaces as a bare ERR_CONNECTION_RESET on every request.
 *    Disabling that feature is what makes the browser usable behind one.
 */
@Injectable()
export class BrowserService implements OnModuleDestroy {
  private readonly logger = new Logger(BrowserService.name);
  private context: BrowserContext | null = null;
  private browser: Browser | null = null;
  private starting: Promise<BrowserContext> | null = null;
  private idleTimer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(calendarConfig.KEY)
    private readonly config: ConfigType<typeof calendarConfig>,
  ) {}

  private launchArgs(): string[] {
    return [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      // Without this, a TLS-terminating proxy resets every connection.
      '--disable-features=PostQuantumKyber,UseMLKEM,EncryptedClientHello,AutomationControlled',
      '--ssl-version-max=tls1.2',
      '--disable-blink-features=AutomationControlled',
    ];
  }

  private async launch(): Promise<BrowserContext> {
    const { scraper } = this.config;
    this.logger.log(
      `launching chromium (headless=${scraper.headless}, profile=${scraper.userDataDir})`,
    );

    const options = {
      headless: scraper.headless,
      executablePath: scraper.executablePath,
      args: this.launchArgs(),
      proxy: scraper.proxyServer ? { server: scraper.proxyServer } : undefined,
    };

    // A persistent context keeps the Cloudflare clearance cookie between polls,
    // so only the first request of a session pays the challenge cost.
    const context = await chromium.launchPersistentContext(scraper.userDataDir, {
      ...options,
      ignoreHTTPSErrors: true,
      viewport: { width: 1440, height: 1000 },
      locale: 'en-US',
      timezoneId: 'UTC',
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });

    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
    context.setDefaultNavigationTimeout(this.config.scraper.navigationTimeoutMs);

    this.context = context;
    this.browser = context.browser();
    context.on('close', () => {
      this.context = null;
      this.browser = null;
    });
    return context;
  }

  private async getContext(): Promise<BrowserContext> {
    if (this.context) return this.context;
    this.starting ??= this.launch().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  /**
   * Run `work` against a fresh page. The browser stays warm afterwards and is
   * torn down only once it has been idle for `scraper.idleShutdownMs`.
   */
  async withPage<T>(work: (page: Page) => Promise<T>): Promise<T> {
    this.cancelIdleShutdown();
    const context = await this.getContext();
    const page = await context.newPage();
    try {
      return await work(page);
    } finally {
      await page.close().catch(() => undefined);
      this.scheduleIdleShutdown();
    }
  }

  /** Drop the browser so the next call starts from a clean profile. */
  async recycle(): Promise<void> {
    this.logger.warn('recycling browser context');
    await this.close();
  }

  private cancelIdleShutdown(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private scheduleIdleShutdown(): void {
    this.cancelIdleShutdown();
    const delay = this.config.scraper.idleShutdownMs;
    if (delay <= 0) return;
    this.idleTimer = setTimeout(() => {
      this.logger.log('closing idle browser');
      void this.close();
    }, delay);
    this.idleTimer.unref?.();
  }

  private async close(): Promise<void> {
    this.cancelIdleShutdown();
    const context = this.context;
    const browser = this.browser;
    this.context = null;
    this.browser = null;
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }
}
