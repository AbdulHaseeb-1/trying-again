import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

/**
 * One named Chromium configuration. Each profile gets its own persistent
 * context, so two scrapers with different needs — ForexFactory has to run
 * headed to clear Cloudflare, CoinGlass is happy headless — never fight over
 * one browser's launch flags or cookie jar.
 */
export type BrowserProfile = {
  /** Identity of the context; one browser per name. */
  name: string;
  userDataDir: string;
  headless: boolean;
  executablePath?: string;
  navigationTimeoutMs: number;
  /** Close the browser after this much idle time; 0 keeps it forever. */
  idleShutdownMs: number;
  proxyServer?: string;
};

type Session = {
  context: BrowserContext | null;
  browser: Browser | null;
  starting: Promise<BrowserContext> | null;
  idleTimer: NodeJS.Timeout | null;
};

/**
 * Owns the Chromium instances the scrapers drive.
 *
 * Two details matter here and are easy to lose:
 *
 * 1. Sites behind a Cloudflare interstitial are never cleared by headless
 *    Chromium. Those profiles launch *headed* (run the process under Xvfb on a
 *    server) and persist the profile so the clearance cookie survives polls.
 * 2. Chromium's post-quantum TLS key share breaks TLS-terminating egress
 *    proxies, which surfaces as a bare ERR_CONNECTION_RESET on every request.
 *    Disabling that feature is what makes the browser usable behind one.
 */
@Injectable()
export class BrowserService implements OnModuleDestroy {
  private readonly logger = new Logger(BrowserService.name);
  private readonly sessions = new Map<string, Session>();

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

  private session(profile: BrowserProfile): Session {
    const existing = this.sessions.get(profile.name);
    if (existing) return existing;
    const created: Session = { context: null, browser: null, starting: null, idleTimer: null };
    this.sessions.set(profile.name, created);
    return created;
  }

  private async launch(profile: BrowserProfile): Promise<BrowserContext> {
    this.logger.log(
      `launching chromium for ${profile.name} (headless=${profile.headless}, profile=${profile.userDataDir})`,
    );

    // A persistent context keeps challenge-clearance cookies between polls, so
    // only the first request of a session pays the challenge cost.
    const context = await chromium.launchPersistentContext(profile.userDataDir, {
      headless: profile.headless,
      executablePath: profile.executablePath,
      args: this.launchArgs(),
      proxy: profile.proxyServer ? { server: profile.proxyServer } : undefined,
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
    context.setDefaultNavigationTimeout(profile.navigationTimeoutMs);

    const session = this.session(profile);
    session.context = context;
    session.browser = context.browser();
    context.on('close', () => {
      session.context = null;
      session.browser = null;
    });
    return context;
  }

  private async getContext(profile: BrowserProfile): Promise<BrowserContext> {
    const session = this.session(profile);
    if (session.context) return session.context;
    session.starting ??= this.launch(profile).finally(() => {
      session.starting = null;
    });
    return session.starting;
  }

  /**
   * Run `work` against a fresh page in `profile`'s browser. The browser stays
   * warm afterwards and is torn down only once it has been idle for
   * `profile.idleShutdownMs`.
   */
  async withPage<T>(profile: BrowserProfile, work: (page: Page) => Promise<T>): Promise<T> {
    this.cancelIdleShutdown(profile);
    const context = await this.getContext(profile);
    const page = await context.newPage();
    try {
      return await work(page);
    } finally {
      await page.close().catch(() => undefined);
      this.scheduleIdleShutdown(profile);
    }
  }

  /** Drop a browser so the next call starts from a clean profile. */
  async recycle(profile: BrowserProfile): Promise<void> {
    this.logger.warn(`recycling browser context ${profile.name}`);
    await this.close(profile.name);
  }

  private cancelIdleShutdown(profile: BrowserProfile): void {
    const session = this.session(profile);
    if (session.idleTimer) {
      clearTimeout(session.idleTimer);
      session.idleTimer = null;
    }
  }

  private scheduleIdleShutdown(profile: BrowserProfile): void {
    this.cancelIdleShutdown(profile);
    if (profile.idleShutdownMs <= 0) return;
    const session = this.session(profile);
    session.idleTimer = setTimeout(() => {
      this.logger.log(`closing idle browser ${profile.name}`);
      void this.close(profile.name);
    }, profile.idleShutdownMs);
    session.idleTimer.unref?.();
  }

  private async close(name: string): Promise<void> {
    const session = this.sessions.get(name);
    if (!session) return;
    if (session.idleTimer) {
      clearTimeout(session.idleTimer);
      session.idleTimer = null;
    }
    const { context, browser } = session;
    session.context = null;
    session.browser = null;
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map((name) => this.close(name)));
  }
}
