import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

import { Injectable, Logger, OnModuleInit, UnauthorizedException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { SecretStore } from '../settings/secret-store.service';

export type AgentPrincipal = {
  userId: string;
  deviceId: string;
};

const TOKEN_SECRET_KEY = 'auth:device:hmac';

/**
 * Who is asking.
 *
 * The application has no account system, and inventing one here would be the
 * wrong change to make inside this feature. What it does have — and what every
 * agent endpoint needs — is a *principal*: something stable to scope
 * conversations, secrets and run ownership to, and something an endpoint can
 * refuse to serve without.
 *
 * So a client registers once and is issued a signed device token. The device is
 * the principal. That gives real isolation between clients today, and the shape
 * is deliberately the one a real account system slots into: swap the issuer for
 * a login and `AgentPrincipal.userId` stops being derived from the device.
 *
 * The signing key lives in the secret store, so tokens survive a restart but
 * not a key rotation — which is the correct trade for a session credential.
 */
@Injectable()
export class DeviceAuthService implements OnModuleInit {
  private readonly logger = new Logger(DeviceAuthService.name);
  private key: Buffer | null = null;
  /** When set, a client must present it to register. Unset means open, as the
   *  rest of this LAN service is. */
  private readonly registrationSecret = process.env.AGENT_REGISTRATION_SECRET || null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretStore,
  ) {}

  async onModuleInit(): Promise<void> {
    const existing = await this.secrets.get(TOKEN_SECRET_KEY);
    if (existing) {
      this.key = Buffer.from(existing, 'base64');
      return;
    }
    const generated = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
    const buffer = Buffer.from(generated, 'utf8');
    await this.secrets.set(TOKEN_SECRET_KEY, buffer.toString('base64'));
    this.key = buffer;
    this.logger.log('issued a new device-token signing key');
  }

  get requiresRegistrationSecret(): boolean {
    return this.registrationSecret !== null;
  }

  async register(input: {
    deviceId?: string;
    label?: string;
    platform?: string;
    secret?: string;
  }): Promise<{ token: string; principal: AgentPrincipal }> {
    if (this.registrationSecret) {
      const provided = input.secret ?? '';
      if (!safeEquals(provided, this.registrationSecret)) {
        throw new UnauthorizedException('Registration secret is missing or incorrect.');
      }
    }

    const deviceId = normalizeDeviceId(input.deviceId) ?? `dev_${randomUUID().replace(/-/g, '')}`;
    const userId = `user_${createHash('sha256').update(deviceId).digest('hex').slice(0, 24)}`;

    const database = this.prisma.db;
    if (database) {
      await database.agentDevice.upsert({
        where: { id: deviceId },
        create: {
          id: deviceId,
          userId,
          label: input.label ?? null,
          platform: input.platform ?? null,
        },
        update: { label: input.label ?? null, platform: input.platform ?? null },
      });
    }

    return { token: this.issue({ userId, deviceId }), principal: { userId, deviceId } };
  }

  issue(principal: AgentPrincipal): string {
    const payload = Buffer.from(
      JSON.stringify({ u: principal.userId, d: principal.deviceId, iat: Date.now() }),
    ).toString('base64url');
    return `${payload}.${this.sign(payload)}`;
  }

  /** Returns the principal, or null for anything that does not verify. */
  verify(token: string | undefined): AgentPrincipal | null {
    if (!token) return null;
    const [payload, signature] = token.split('.');
    if (!payload || !signature) return null;
    if (!safeEquals(signature, this.sign(payload))) return null;
    try {
      const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
        u?: string;
        d?: string;
      };
      if (!decoded.u || !decoded.d) return null;
      return { userId: decoded.u, deviceId: decoded.d };
    } catch {
      return null;
    }
  }

  private sign(payload: string): string {
    if (!this.key) throw new Error('device auth is not initialised');
    return createHmac('sha256', this.key).update(payload).digest('base64url');
  }
}

function safeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  // Compare lengths first, but still run the constant-time compare so a length
  // mismatch is not distinguishable by timing from a content mismatch.
  if (left.length !== right.length) {
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

function normalizeDeviceId(value: string | undefined): string | null {
  if (!value) return null;
  const cleaned = value.trim();
  if (!/^[A-Za-z0-9_.:-]{8,128}$/.test(cleaned)) return null;
  return cleaned;
}
