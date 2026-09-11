import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { describe, it } from 'node:test';

import { BraveSearchProvider } from '../src/search/providers/brave.provider';
import { ExaSearchProvider } from '../src/search/providers/exa.provider';
import { OpenAiHostedSearchProvider } from '../src/search/providers/openai-hosted.provider';
import { RestSearchProvider } from '../src/search/providers/rest.provider';
import { SearxngSearchProvider } from '../src/search/providers/searxng.provider';
import { TavilySearchProvider } from '../src/search/providers/tavily.provider';
import type {
  SearchProvider,
  SearchProviderConfig,
  SearchQueryOptions,
} from '../src/search/search-provider';

const PROVIDERS: SearchProvider[] = [
  new TavilySearchProvider(),
  new ExaSearchProvider(),
  new BraveSearchProvider(),
  new OpenAiHostedSearchProvider(),
  new SearxngSearchProvider('searxng-test', 'SearXNG Test'),
  new RestSearchProvider('rest-test', 'REST Test'),
];

const options: SearchQueryOptions = {
  maxResults: 5,
  depth: 'basic',
  recencyDays: null,
  allowedDomains: [],
  blockedDomains: [],
  safeSearch: true,
  timeoutMs: 2_000,
};

const config = (overrides: Partial<SearchProviderConfig> = {}): SearchProviderConfig => ({
  providerId: 'test',
  apiKey: 'test-key',
  baseUrl: null,
  timeoutMs: 2_000,
  ...overrides,
});

/**
 * The search-provider contract.
 *
 * Same suite, every engine — because the tool layer calls them
 * interchangeably. The rules that matter are the ones an adapter is most
 * tempted to skip: normalise to `SearchResult`, apply the domain policy
 * yourself rather than trusting the engine's parameters, and report a health
 * failure without echoing the upstream body.
 */
for (const provider of PROVIDERS) {
  describe(`SearchProvider contract: ${provider.id}`, () => {
    it('declares an identity and a capability matrix', () => {
      assert.match(provider.id, /^[a-z0-9-]+$/);
      assert.ok(provider.name.length > 0);
      for (const key of [
        'fullTextFetch',
        'domainFilter',
        'recencyFilter',
        'safeSearch',
        'scores',
        'requiresApiKey',
        'requiresBaseUrl',
      ] as const) {
        assert.equal(typeof provider.capabilities[key], 'boolean', key);
      }
    });

    it('reports not_configured rather than calling out with nothing', async () => {
      const missing = provider.capabilities.requiresApiKey
        ? config({ apiKey: null })
        : config({ baseUrl: null });
      const health = await provider.healthCheck(missing);
      if (provider.capabilities.requiresApiKey || provider.capabilities.requiresBaseUrl) {
        assert.equal(health.status, 'not_configured');
      } else {
        assert.ok(health.status.length > 0);
      }
    });

    it('offers fetch only when it claims full-text retrieval', () => {
      assert.equal(
        typeof provider.fetch === 'function',
        provider.capabilities.fullTextFetch,
        provider.id,
      );
    });
  });
}

/**
 * Wire behaviour, against a real HTTP endpoint: the generic adapters are the
 * ones an operator points at their own infrastructure, so they are the ones
 * whose parsing and policy handling get exercised for real.
 */
describe('SearchProvider contract: live behaviour over HTTP', () => {
  it('normalises a bare array, applies the block list, and caps results', async () => {
    const server = await startJsonServer(() => [
      { title: 'Reuters piece', url: 'https://www.reuters.com/a', snippet: '  spaced   out  ' },
      { name: 'Alt field names', link: 'https://exa.test/b', description: 'second' },
      { title: 'Blocked', url: 'https://spam.test/c' },
      { title: 'Fourth', url: 'https://four.test/d' },
    ]);

    try {
      const provider = new RestSearchProvider('rest-live', 'REST Live');
      const results = await provider.search(
        'markets',
        { ...options, maxResults: 2, blockedDomains: ['spam.test'] },
        config({ baseUrl: server.url }),
      );

      assert.equal(results.length, 2);
      assert.equal(results[0].domain, 'reuters.com');
      assert.equal(results[0].snippet, 'spaced out');
      // The second row uses `name`/`link`/`description` — the other spelling
      // these endpoints use — and must normalise identically.
      assert.equal(results[1].url, 'https://exa.test/b');
      assert.equal(results[1].title, 'Alt field names');
      assert.equal(results.every((entry) => entry.provider === 'rest-live'), true);
      assert.equal(
        results.some((entry) => entry.domain === 'spam.test'),
        false,
      );
    } finally {
      await server.close();
    }
  });

  it('enforces an allow list the engine ignored', async () => {
    // The engine returns whatever it likes; the adapter is what makes the
    // allow list a rule rather than a request.
    const server = await startJsonServer(() => ({
      results: [
        { title: 'Allowed', url: 'https://reuters.com/a' },
        { title: 'Sneaked in', url: 'https://elsewhere.test/b' },
      ],
    }));

    try {
      const provider = new RestSearchProvider('rest-live', 'REST Live');
      const results = await provider.search(
        'markets',
        { ...options, allowedDomains: ['reuters.com'] },
        config({ baseUrl: server.url }),
      );
      assert.deepEqual(
        results.map((entry) => entry.domain),
        ['reuters.com'],
      );
    } finally {
      await server.close();
    }
  });

  it('maps an auth failure without echoing the upstream body', async () => {
    const server = await startJsonServer(() => ({ error: 'key sk-abc123 is invalid' }), 401);
    try {
      const provider = new SearxngSearchProvider('searx-live', 'SearXNG Live');
      const health = await provider.healthCheck(config({ baseUrl: server.url }));
      assert.equal(health.status, 'auth_failed');
      assert.equal(health.message.includes('sk-abc123'), false);
    } finally {
      await server.close();
    }
  });

  it('maps rate limiting and server errors distinctly', async () => {
    const rateLimited = await startJsonServer(() => ({}), 429);
    const broken = await startJsonServer(() => ({}), 503);
    try {
      const provider = new SearxngSearchProvider('searx-live', 'SearXNG Live');
      assert.equal(
        (await provider.healthCheck(config({ baseUrl: rateLimited.url }))).status,
        'rate_limited',
      );
      assert.equal(
        (await provider.healthCheck(config({ baseUrl: broken.url }))).status,
        'unreachable',
      );
    } finally {
      await rateLimited.close();
      await broken.close();
    }
  });

  it('reports ok with a latency when a query succeeds', async () => {
    const server = await startJsonServer(() => ({
      results: [{ title: 'A', url: 'https://a.test/1', content: 'body' }],
    }));
    try {
      const provider = new SearxngSearchProvider('searx-live', 'SearXNG Live');
      const health = await provider.healthCheck(config({ baseUrl: server.url }));
      assert.equal(health.status, 'ok');
      assert.equal(typeof health.latencyMs, 'number');
    } finally {
      await server.close();
    }
  });

  it('reports unreachable when nothing is listening', async () => {
    const provider = new SearxngSearchProvider('searx-live', 'SearXNG Live');
    const health = await provider.healthCheck(
      config({ baseUrl: 'http://127.0.0.1:1', timeoutMs: 1_000 }),
    );
    assert.equal(health.status, 'unreachable');
  });
});

async function startJsonServer(
  body: () => unknown,
  status = 200,
): Promise<{ url: string; close: () => Promise<void> }> {
  const server: Server = createServer((_request, response) => {
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(body()));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: async () => {
      server.closeAllConnections?.();
      server.close();
      await once(server, 'close').catch(() => undefined);
    },
  };
}
