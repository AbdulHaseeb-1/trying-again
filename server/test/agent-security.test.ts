import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { ValidationPipe } from '@nestjs/common';

import { DeviceAuthService } from '../src/agent/auth/device-auth.service';
import { RegisterDeviceDto } from '../src/agent/dto/agent.dto';
import { SecretStore } from '../src/agent/settings/secret-store.service';
import { UnsafeUrlError, UrlFetcher } from '../src/search/fetch/url-fetcher';

/** A PrismaService stand-in with no database, exercising the file backing. */
const noDatabase = { db: null } as never;

let workspace: string;
const originalCwd = process.cwd();

before(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'agent-secrets-'));
  process.chdir(workspace);
});

after(async () => {
  process.chdir(originalCwd);
  await rm(workspace, { recursive: true, force: true });
});

describe('secret store', () => {
  it('round-trips a secret and never writes it in the clear', async () => {
    const store = new SecretStore(noDatabase);
    await store.onModuleInit();

    await store.set('provider:openai:apiKey', 'sk-live-abcdef1234567890');
    assert.equal(await store.get('provider:openai:apiKey'), 'sk-live-abcdef1234567890');

    // The whole point of encrypting at rest: the file is not a credential dump.
    const onDisk = await readFile(join(workspace, 'data/agent-secrets.json'), 'utf8');
    assert.equal(onDisk.includes('sk-live-abcdef'), false);
    assert.match(onDisk, /"ciphertext"/);
    assert.match(onDisk, /"iv"/);
    assert.match(onDisk, /"tag"/);
  });

  it('previews a key without revealing it', async () => {
    const store = new SecretStore(noDatabase);
    await store.onModuleInit();
    await store.set('provider:preview:apiKey', 'sk-live-abcdef1234567890');

    const preview = await store.preview('provider:preview:apiKey');
    assert.equal(preview, 'sk-…7890');
    assert.equal(preview?.includes('abcdef'), false);
  });

  it('masks a short secret entirely rather than showing most of it', async () => {
    const store = new SecretStore(noDatabase);
    await store.onModuleInit();
    await store.set('provider:short:apiKey', 'abcd1234');
    assert.equal(await store.preview('provider:short:apiKey'), '••••');
  });

  it('reports an absent secret as absent', async () => {
    const store = new SecretStore(noDatabase);
    await store.onModuleInit();
    assert.equal(await store.get('provider:missing:apiKey'), null);
    assert.equal(await store.preview('provider:missing:apiKey'), null);
    assert.equal(await store.has('provider:missing:apiKey'), false);
  });

  it('clears a secret when an empty value is stored', async () => {
    const store = new SecretStore(noDatabase);
    await store.onModuleInit();
    await store.set('provider:clearme:apiKey', 'sk-value');
    await store.set('provider:clearme:apiKey', '');
    assert.equal(await store.has('provider:clearme:apiKey'), false);
  });

  it('cannot read a secret sealed under a different key', async () => {
    process.env.AGENT_SECRET_KEY = 'passphrase-one';
    const first = new SecretStore(noDatabase);
    await first.onModuleInit();
    await first.set('provider:rotate:apiKey', 'sk-rotate-me');
    assert.equal(await first.get('provider:rotate:apiKey'), 'sk-rotate-me');

    process.env.AGENT_SECRET_KEY = 'passphrase-two';
    const second = new SecretStore(noDatabase);
    await second.onModuleInit();
    // A rotated key makes stored secrets unreadable rather than silently wrong.
    assert.equal(await second.get('provider:rotate:apiKey'), null);
    delete process.env.AGENT_SECRET_KEY;
  });
});

describe('device authentication', () => {
  async function service(): Promise<DeviceAuthService> {
    const secrets = new SecretStore(noDatabase);
    await secrets.onModuleInit();
    const auth = new DeviceAuthService(noDatabase, secrets);
    await auth.onModuleInit();
    return auth;
  }

  it('issues a token that verifies back to the same principal', async () => {
    const auth = await service();
    const { token, principal } = await auth.register({ deviceId: 'device-abcdef12' });
    const verified = auth.verify(token);
    assert.deepEqual(verified, principal);
    assert.match(principal.userId, /^user_[0-9a-f]{24}$/);
  });

  it('derives the same principal for the same device every time', async () => {
    const auth = await service();
    const first = await auth.register({ deviceId: 'device-stable01' });
    const second = await auth.register({ deviceId: 'device-stable01' });
    assert.equal(first.principal.userId, second.principal.userId);
  });

  it('separates two devices into two principals', async () => {
    const auth = await service();
    const a = await auth.register({ deviceId: 'device-aaaaaa01' });
    const b = await auth.register({ deviceId: 'device-bbbbbb02' });
    assert.notEqual(a.principal.userId, b.principal.userId);
  });

  it('rejects a tampered payload', async () => {
    const auth = await service();
    const { token } = await auth.register({ deviceId: 'device-abcdef12' });
    const [payload, signature] = token.split('.');

    // Re-sign nothing: swap the payload for one naming another user.
    const forged = Buffer.from(
      JSON.stringify({ u: 'user_victim', d: 'device-victim01', iat: Date.now() }),
    ).toString('base64url');
    assert.equal(auth.verify(`${forged}.${signature}`), null);
    assert.equal(auth.verify(`${payload}.${signature}x`), null);
    assert.equal(auth.verify('garbage'), null);
    assert.equal(auth.verify(undefined), null);
  });

  it('rejects a token signed by a different installation', async () => {
    const first = await service();
    const { token } = await first.register({ deviceId: 'device-abcdef12' });

    // A second store in a fresh directory generates its own signing key.
    const other = await mkdtemp(join(tmpdir(), 'agent-secrets-other-'));
    const previous = process.cwd();
    process.chdir(other);
    try {
      const second = await service();
      assert.equal(second.verify(token), null);
    } finally {
      process.chdir(previous);
      await rm(other, { recursive: true, force: true });
    }
  });

  it('rejects a malformed device id rather than trusting it', async () => {
    const auth = await service();
    const { principal } = await auth.register({ deviceId: '../../etc/passwd' });
    // The bad id is discarded and a generated one issued instead.
    assert.notEqual(principal.deviceId, '../../etc/passwd');
    assert.match(principal.deviceId, /^dev_[0-9a-f]+$/);
  });

  it('carries the registration secret through the validation pipe', async () => {
    // `whitelist: true` drops every property without a validation decorator, so
    // a gate the client cannot get past would look exactly like a wrong secret.
    const pipe = new ValidationPipe({ transform: true, whitelist: true });
    const body = (await pipe.transform(
      { deviceId: 'device-abcdef12', platform: 'web', secret: 'let-me-in', junk: 'dropped' },
      { type: 'body', metatype: RegisterDeviceDto },
    )) as RegisterDeviceDto & { junk?: string };

    assert.equal(body.secret, 'let-me-in');
    assert.equal(body.junk, undefined);
  });

  it('requires the registration secret when one is configured', async () => {
    process.env.AGENT_REGISTRATION_SECRET = 'let-me-in';
    try {
      const secrets = new SecretStore(noDatabase);
      await secrets.onModuleInit();
      const auth = new DeviceAuthService(noDatabase, secrets);
      await auth.onModuleInit();

      await assert.rejects(() => auth.register({ deviceId: 'device-abcdef12' }));
      await assert.rejects(() => auth.register({ deviceId: 'device-abcdef12', secret: 'wrong' }));
      const allowed = await auth.register({ deviceId: 'device-abcdef12', secret: 'let-me-in' });
      assert.ok(allowed.token.length > 0);
    } finally {
      delete process.env.AGENT_REGISTRATION_SECRET;
    }
  });
});

/**
 * The SSRF guard.
 *
 * These are the addresses a prompt-injected page actually tries: the cloud
 * metadata service, loopback under a public-looking name, and the decimal and
 * IPv6 spellings that defeat a string check.
 */
describe('url fetcher safety', () => {
  const fetcher = new UrlFetcher();

  it('refuses a non-https scheme', async () => {
    for (const url of [
      'http://example.com',
      'file:///etc/passwd',
      'ftp://example.com/x',
      'gopher://example.com',
    ]) {
      await assert.rejects(() => fetcher.assertSafe(url, [], []), UnsafeUrlError, url);
    }
  });

  it('refuses a malformed URL', async () => {
    await assert.rejects(() => fetcher.assertSafe('not a url', [], []), UnsafeUrlError);
  });

  it('refuses loopback, private and link-local addresses', async () => {
    for (const url of [
      'https://127.0.0.1/',
      'https://localhost/',
      'https://10.0.0.5/',
      'https://192.168.1.1/',
      'https://172.16.0.1/',
      // The cloud metadata endpoint — the single most valuable SSRF target.
      'https://169.254.169.254/latest/meta-data/',
      'https://[::1]/',
      // Decimal loopback: 2130706433 === 127.0.0.1.
      'https://2130706433/',
    ]) {
      await assert.rejects(() => fetcher.assertSafe(url, [], []), UnsafeUrlError, url);
    }
  });

  it('refuses a host outside the configured allow list', async () => {
    await assert.rejects(
      () => fetcher.assertSafe('https://elsewhere.test/x', ['reuters.com'], []),
      UnsafeUrlError,
    );
  });

  it('refuses a blocked host', async () => {
    await assert.rejects(
      () => fetcher.assertSafe('https://spam.test/x', [], ['spam.test']),
      UnsafeUrlError,
    );
  });

  it('refuses a host that does not resolve', async () => {
    await assert.rejects(
      () => fetcher.assertSafe('https://nonexistent.invalid/x', [], []),
      UnsafeUrlError,
    );
  });
});
