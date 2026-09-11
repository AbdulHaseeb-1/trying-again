import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AnthropicLLMProvider } from '../src/agent/providers/anthropic.provider';
import { GoogleLLMProvider } from '../src/agent/providers/google.provider';
import {
  DEFAULT_PROVIDER_CONFIG,
  MODEL_PARAMETERS,
  PROVIDER_KINDS,
  type LLMProvider,
  type ProviderConfig,
} from '../src/agent/providers/llm-provider';
import { OpenAiCompatibleLLMProvider } from '../src/agent/providers/openai-compatible.provider';
import { OpenAiLLMProvider } from '../src/agent/providers/openai.provider';
import { OpenRouterLLMProvider } from '../src/agent/providers/openrouter.provider';
import { mergeHeaders } from '../src/agent/providers/provider-support';
import { startFakeOpenAi } from './support/fake-openai';

/**
 * The provider contract.
 *
 * Every `LLMProvider` runs the *same* suite. That is the point of the interface:
 * a new vendor is correct when it passes these, and a vendor that quietly drops
 * a rule — returns a raw upstream message from `testConnection`, say, or claims
 * a parameter it cannot honour — fails here rather than in production.
 */
const PROVIDERS: LLMProvider[] = [
  new OpenAiLLMProvider(),
  new OpenRouterLLMProvider(),
  new AnthropicLLMProvider(),
  new GoogleLLMProvider(),
  new OpenAiCompatibleLLMProvider('test-compatible', 'Test Compatible'),
];

function configFor(provider: LLMProvider, overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    ...DEFAULT_PROVIDER_CONFIG,
    providerId: provider.id,
    enabled: true,
    apiKey: 'test-key-1234567890',
    baseUrl: provider.kind === 'openai-compatible' ? 'https://gateway.test/v1' : null,
    timeoutMs: 4_000,
    ...overrides,
  };
}

for (const provider of PROVIDERS) {
  describe(`LLMProvider contract: ${provider.id}`, () => {
    it('declares an identity the registry can key on', () => {
      assert.match(provider.id, /^[a-z0-9-]+$/);
      assert.ok(provider.name.length > 0);
      assert.ok(PROVIDER_KINDS.includes(provider.kind));
    });

    it('declares a complete capability matrix', () => {
      const capabilities = provider.capabilities;
      for (const key of [
        'streaming',
        'toolCalling',
        'structuredOutput',
        'reasoning',
        'vision',
        'images',
        'webSearch',
        'mcp',
        'usageReporting',
      ] as const) {
        assert.equal(typeof capabilities[key], 'boolean', key);
      }
      assert.ok(capabilities.defaultContextWindow > 0);
    });

    it('can call a tool, or the agent runtime has nothing to offer it', () => {
      // Every agent in this application uses tools; a provider that cannot is
      // not usable here, so the contract asserts it rather than discovering it.
      assert.equal(provider.capabilities.toolCalling, true);
      assert.equal(provider.capabilities.streaming, true);
    });

    it('only claims parameters from the shared vocabulary', () => {
      for (const parameter of provider.supportedParameters) {
        assert.ok(MODEL_PARAMETERS.includes(parameter), parameter);
      }
      assert.ok(provider.supportedParameters.length > 0);
    });

    it('describes its own configuration form', () => {
      assert.ok(provider.configFields.length > 0);
      for (const field of provider.configFields) {
        assert.ok(field.label.length > 0);
        assert.equal(typeof field.required, 'boolean');
        assert.equal(typeof field.secret, 'boolean');
      }
      // Whatever the vendor calls it, a key is always marked secret.
      const apiKeyField = provider.configFields.find((field) => field.key === 'apiKey');
      if (apiKeyField) assert.equal(apiKeyField.secret, true);
    });

    it('rejects a configuration with no key', () => {
      const issues = provider.validateConfiguration(configFor(provider, { apiKey: null }));
      assert.ok(issues.length > 0);
      assert.equal(issues[0].field, 'apiKey');
    });

    it('accepts a complete configuration', () => {
      assert.deepEqual(provider.validateConfiguration(configFor(provider)), []);
    });

    it('rejects a plaintext base URL', () => {
      const issues = provider.validateConfiguration(
        configFor(provider, { baseUrl: 'http://gateway.test/v1' }),
      );
      assert.ok(issues.some((issue) => issue.field === 'baseUrl'));
    });

    it('reports not_configured rather than attempting a call', async () => {
      const outcome = await provider.testConnection(configFor(provider, { apiKey: null }));
      assert.equal(outcome.status, 'not_configured');
    });

    it('reports unreachable for an endpoint that does not answer', async () => {
      // Port 1 is reserved and never listening.
      const outcome = await provider.testConnection(
        configFor(provider, { baseUrl: 'https://127.0.0.1:1/v1', timeoutMs: 1_500 }),
      );
      assert.equal(outcome.status, 'unreachable');
      assert.ok(outcome.message.length > 0);
    });

    it('never leaks the key or the endpoint in a connection message', async () => {
      const outcome = await provider.testConnection(
        configFor(provider, {
          apiKey: 'sk-super-secret-value',
          baseUrl: 'https://127.0.0.1:1/v1',
          timeoutMs: 1_500,
        }),
      );
      assert.equal(outcome.message.includes('sk-super-secret'), false);
      assert.equal(outcome.message.includes('127.0.0.1'), false);
    });

    it('offers models that a picker can render', () => {
      for (const model of provider.suggestedModels) {
        assert.ok(model.id.length > 0);
        assert.ok(model.label.length > 0);
      }
    });
  });
}

/**
 * The OpenAI-compatible adapter is the one every custom provider is built from,
 * so it gets the live wire test: a real HTTP endpoint, the real listing path,
 * and the real status mapping.
 */
describe('LLMProvider contract: live behaviour over HTTP', () => {
  it('lists models, detects a bad key, and flags a missing model', async () => {
    const fake = await startFakeOpenAi({ turns: [{ kind: 'text', text: 'hi' }], apiKey: 'good-key' });
    const provider = new OpenAiCompatibleLLMProvider('live', 'Live');

    try {
      const good = configFor(provider, { apiKey: 'good-key', baseUrl: fake.url });

      const models = await provider.listModels(good);
      assert.deepEqual(
        models.map((model) => model.id),
        ['fake-model-1', 'fake-model-2'],
      );

      const connected = await provider.testConnection(good);
      assert.equal(connected.status, 'connected');
      assert.equal(typeof connected.latencyMs, 'number');
      assert.equal(connected.modelsDiscovered, 2);

      const rejected = await provider.testConnection(configFor(provider, {
        apiKey: 'wrong-key',
        baseUrl: fake.url,
      }));
      assert.equal(rejected.status, 'auth_failed');
      assert.equal(rejected.message.includes('wrong-key'), false);

      const model = await provider.createModel(good, 'fake-model-1');
      assert.equal(typeof model.getStreamedResponse, 'function');
    } finally {
      await fake.close();
    }
  });
});

describe('provider header merging', () => {
  it('adds custom headers', () => {
    const merged = mergeHeaders({ authorization: 'Bearer k' }, { 'x-team': 'markets' });
    assert.equal(merged['x-team'], 'markets');
  });

  it('refuses to let a custom header replace the credential', () => {
    // Otherwise "custom headers" becomes a way for anyone who can edit settings
    // to redirect a stored key they are not allowed to read.
    const merged = mergeHeaders(
      { authorization: 'Bearer real-key' },
      { Authorization: 'Bearer attacker', 'content-type': 'text/plain' },
    );
    assert.equal(merged.authorization, 'Bearer real-key');
    assert.equal(merged.Authorization, undefined);
  });
});
