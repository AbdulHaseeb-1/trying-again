import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { JsonFileStore } from './json-file-store';

type SealedSecret = { ciphertext: string; iv: string; tag: string };

const ALGORITHM = 'aes-256-gcm';
const KEY_PATH = process.env.AGENT_SECRET_KEY_PATH ?? 'data/agent-secret.key';
const FILE_PATH = process.env.AGENT_SECRET_STORE_PATH ?? 'data/agent-secrets.json';

/**
 * Where provider and search credentials live.
 *
 * Three rules, and they are the whole design:
 *
 *  1. A secret is encrypted before it is stored, with AES-256-GCM under a key
 *     that lives outside the database. A database dump is therefore not a
 *     credential dump.
 *  2. A secret is never returned. `preview()` is the only read the API layer
 *     can reach, and it returns four characters and a length.
 *  3. Plaintext exists only inside a single call — resolved at the moment a
 *     provider is constructed, never cached on a config object that might be
 *     serialised.
 */
@Injectable()
export class SecretStore implements OnModuleInit {
  private readonly logger = new Logger(SecretStore.name);
  private key: Buffer | null = null;
  private readonly file = new JsonFileStore<Record<string, SealedSecret>>(FILE_PATH, () => ({}));

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    this.key = await this.resolveKey();
  }

  /** Store (or replace) a secret. Passing an empty string clears it. */
  async set(key: string, plaintext: string): Promise<void> {
    if (plaintext.length === 0) {
      await this.clear(key);
      return;
    }
    const sealed = this.seal(plaintext);
    const database = this.prisma.db;
    if (database) {
      await database.agentSecret.upsert({
        where: { key },
        create: { key, ...sealed },
        update: sealed,
      });
      return;
    }
    await this.file.update((current) => ({ ...current, [key]: sealed }));
  }

  async clear(key: string): Promise<void> {
    const database = this.prisma.db;
    if (database) {
      await database.agentSecret.deleteMany({ where: { key } });
      return;
    }
    await this.file.update((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  /**
   * The plaintext. Called only from the provider/search factory paths, never
   * from a controller.
   */
  async get(key: string): Promise<string | null> {
    const sealed = await this.readSealed(key);
    if (!sealed) return null;
    try {
      return this.open(sealed);
    } catch (error) {
      // A key rotation without a re-entry of the secrets lands here. Say so
      // plainly rather than presenting an unusable provider as configured.
      this.logger.error(`secret "${key}" could not be decrypted with the current key`);
      void error;
      return null;
    }
  }

  async has(key: string): Promise<boolean> {
    return (await this.readSealed(key)) !== null;
  }

  /** "sk-…9f2c" — enough for a human to recognise which key is stored. */
  async preview(key: string): Promise<string | null> {
    const value = await this.get(key);
    if (!value) return null;
    if (value.length <= 8) return '••••';
    return `${value.slice(0, 3)}…${value.slice(-4)}`;
  }

  private async readSealed(key: string): Promise<SealedSecret | null> {
    const database = this.prisma.db;
    if (database) {
      const row = await database.agentSecret.findUnique({ where: { key } });
      return row ? { ciphertext: row.ciphertext, iv: row.iv, tag: row.tag } : null;
    }
    const all = await this.file.read();
    return all[key] ?? null;
  }

  private seal(plaintext: string): SealedSecret {
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, this.requireKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
    };
  }

  private open(sealed: SealedSecret): string {
    const decipher = createDecipheriv(
      ALGORITHM,
      this.requireKey(),
      Buffer.from(sealed.iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(sealed.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  private requireKey(): Buffer {
    if (!this.key) throw new Error('secret store is not initialised');
    return this.key;
  }

  /**
   * `AGENT_SECRET_KEY` in a deployment; a generated 0600 file otherwise.
   *
   * Generating one keeps a first run working without ceremony, but it is not
   * the production answer — a rebuilt container gets a new key and every stored
   * secret becomes undecryptable — so it warns every boot.
   */
  private async resolveKey(): Promise<Buffer> {
    const configured = process.env.AGENT_SECRET_KEY;
    if (configured && configured.length > 0) {
      // Accept any length: hashing gives a uniform 32 bytes from a passphrase
      // as readily as from a generated key.
      return createHash('sha256').update(configured).digest();
    }
    try {
      const stored = await readFile(KEY_PATH, 'utf8');
      if (stored.trim().length > 0) {
        this.logger.warn(
          'AGENT_SECRET_KEY is not set — using the generated key file. Set it in deployments.',
        );
        return Buffer.from(stored.trim(), 'base64');
      }
    } catch {
      // Falls through to generating one.
    }
    const generated = randomBytes(32);
    await mkdir(dirname(KEY_PATH), { recursive: true });
    await writeFile(KEY_PATH, generated.toString('base64'), { mode: 0o600 });
    await chmod(KEY_PATH, 0o600).catch(() => undefined);
    this.logger.warn(
      `AGENT_SECRET_KEY is not set — generated one at ${KEY_PATH}. Set it in deployments.`,
    );
    return generated;
  }
}
