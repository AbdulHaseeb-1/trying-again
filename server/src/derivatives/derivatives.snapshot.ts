import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { derivativesConfig } from '../config/configuration';
import type { DerivativesSnapshot } from './derivatives.types';

/**
 * Last-known-good persistence for the derivatives snapshot.
 *
 * A scrape needs a browser and a working egress path, so it can fail for
 * reasons that have nothing to do with this service. Writing each good run to
 * disk means a restart comes up populated and a blocked scrape degrades to
 * stale-but-labelled rather than an empty screen.
 */
@Injectable()
export class DerivativesSnapshotStore {
  private readonly logger = new Logger(DerivativesSnapshotStore.name);
  private readonly path: string;
  private readonly seedPath: string;

  constructor(
    @Inject(derivativesConfig.KEY)
    private readonly config: ConfigType<typeof derivativesConfig>,
  ) {
    this.path = resolve(process.cwd(), this.config.snapshot.path);
    this.seedPath = resolve(process.cwd(), this.config.snapshot.seedPath);
  }

  /** Prefer the runtime cache; fall back to the checked-in seed on a first run. */
  async load(): Promise<DerivativesSnapshot | null> {
    if (!this.config.snapshot.enabled) return null;
    return (await this.read(this.path, 'cache')) ?? (await this.read(this.seedPath, 'seed'));
  }

  private async read(path: string, kind: 'cache' | 'seed'): Promise<DerivativesSnapshot | null> {
    try {
      const snapshot = JSON.parse(await readFile(path, 'utf8')) as DerivativesSnapshot;
      if (!Array.isArray(snapshot?.assets)) throw new Error('malformed snapshot');
      this.logger.log(
        `restored ${snapshot.assets.length} assets from ${kind} (captured ${snapshot.capturedAt})`,
      );
      return snapshot;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') this.logger.warn(`${kind} snapshot unreadable: ${error}`);
      return null;
    }
  }

  /** Atomic write, so a crash mid-save cannot leave a truncated snapshot behind. */
  async save(snapshot: DerivativesSnapshot): Promise<void> {
    if (!this.config.snapshot.enabled) return;
    try {
      await mkdir(dirname(this.path), { recursive: true });
      const temporary = `${this.path}.tmp`;
      await writeFile(temporary, JSON.stringify(snapshot), 'utf8');
      await rename(temporary, this.path);
    } catch (error) {
      this.logger.warn(`snapshot save failed: ${error}`);
    }
  }
}
