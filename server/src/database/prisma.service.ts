import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../generated/prisma/client';

/**
 * The archive's connection, and the decision to have one at all.
 *
 * Postgres is optional on purpose. The scrapers, the in-memory window and the
 * file snapshot all predate it and still work without it, so a missing
 * `DATABASE_URL` — a laptop, a demo, a first clone — degrades to "live data
 * only, no history" instead of refusing to boot. Everything that writes to the
 * archive checks `enabled` first; everything that reads from it says plainly
 * that history is unavailable rather than returning a confident empty list.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  /**
   * Read on init rather than at construction: ConfigModule loads `.env` into
   * `process.env` as it boots, and a field initialiser can run first.
   */
  private url: string | undefined;
  private client: PrismaClient | null = null;
  private connected = false;
  private failure: string | null = null;

  async onModuleInit(): Promise<void> {
    this.url = process.env.DATABASE_URL;
    if (!this.url) {
      this.logger.warn('DATABASE_URL is not set — running without the archive');
      return;
    }

    try {
      const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: this.url }) });
      await client.$queryRaw`SELECT 1`;
      this.client = client;
      this.connected = true;
      this.logger.log(`archive connected (${this.describeTarget()})`);
    } catch (error) {
      // A database that is down must not take the whole service with it: the
      // live scrape is the part users actually watch.
      this.failure = error instanceof Error ? error.message : String(error);
      this.logger.error(`archive unavailable: ${this.failure}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.$disconnect().catch(() => undefined);
    this.client = null;
    this.connected = false;
  }

  /** True when reads and writes will actually reach Postgres. */
  get enabled(): boolean {
    return this.connected && this.client !== null;
  }

  /** Why the archive is off, for `/status` — never the credentials themselves. */
  get status(): { enabled: boolean; target: string | null; error: string | null } {
    return {
      enabled: this.enabled,
      target: this.url ? this.describeTarget() : null,
      error: this.url ? this.failure : 'DATABASE_URL is not set',
    };
  }

  /** The client, or null when there is no archive to talk to. */
  get db(): PrismaClient | null {
    return this.enabled ? this.client : null;
  }

  /** Host and database only — a connection string carries a password. */
  private describeTarget(): string {
    try {
      const parsed = new URL(this.url!);
      return `${parsed.host}${parsed.pathname}`;
    } catch {
      return 'configured';
    }
  }
}
