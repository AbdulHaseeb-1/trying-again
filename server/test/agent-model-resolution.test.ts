import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';

import { AgentError } from '../src/agent/agent.errors';
import { OpenAiCompatibleLLMProvider } from '../src/agent/providers/openai-compatible.provider';
import { LLM_PROVIDERS, ProviderRegistry } from '../src/agent/providers/provider-registry.service';
import type { AgentDefinition } from '../src/agent/registry/agent-definition';
import { ModelResolver } from '../src/agent/runtime/model-resolver.service';
import { AiSettingsService } from '../src/agent/settings/ai-settings.service';
import { SecretStore } from '../src/agent/settings/secret-store.service';

const noDatabase = { db: null } as never;

const definition = (overrides: Partial<AgentDefinition> = {}): AgentDefinition => ({
  id: 'test-agent',
  name: 'Test Agent',
  description: 'For resolution tests.',
  instructions: 'Answer.',
  capabilities: [],
  modelRole: 'primary',
  userFacing: true,
  ...overrides,
});

let workspace: string;
const originalCwd = process.cwd();

before(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'agent-models-'));
  process.chdir(workspace);
  process.env.AGENT_SECRET_KEY = 'model-resolution-tests';
});

after(async () => {
  process.chdir(originalCwd);
  delete process.env.AGENT_SECRET_KEY;
  await rm(workspace, { recursive: true, force: true });
});

async function build() {
  // A fresh settings document per case: these tests are about resolution order,
  // and order is only visible when the previous case has not left a default
  // lying around.
  await rm(join(workspace, 'data'), { recursive: true, force: true });

  const secrets = new SecretStore(noDatabase);
  await secrets.onModuleInit();
  const settings = new AiSettingsService(noDatabase, secrets);
  await settings.onModuleInit();

  const providers = new ProviderRegistry(
    [
      new OpenAiCompatibleLLMProvider('alpha', 'Alpha'),
      new OpenAiCompatibleLLMProvider('beta', 'Beta'),
    ],
    settings,
    secrets,
  );
  await providers.onModuleInit();

  const resolver = new ModelResolver(settings, providers);
  return { settings, providers, resolver };
}

describe('model resolution', () => {
  let harness: Awaited<ReturnType<typeof build>>;

  beforeEach(async () => {
    harness = await build();
  });

  it('refuses clearly when nothing is configured', async () => {
    await assert.rejects(
      () => harness.resolver.plan(definition()),
      (error: unknown) =>
        error instanceof AgentError && error.code === 'provider_not_configured',
    );
  });

  it('falls back to the only enabled provider on a first run', async () => {
    await harness.settings.updateProvider('alpha', { enabled: true, defaultModel: 'alpha-1' });
    const plan = await harness.resolver.plan(definition());
    assert.equal(plan.primary.ref.providerId, 'alpha');
    assert.equal(plan.primary.ref.modelId, 'alpha-1');
    assert.equal(plan.primary.ref.providerName, 'Alpha');
  });

  it('prefers the role slot over the provider default', async () => {
    await harness.settings.updateProvider('alpha', { enabled: true, defaultModel: 'alpha-1' });
    await harness.settings.setModelRole('research', { providerId: 'beta', modelId: 'beta-2' });

    const research = await harness.resolver.plan(definition({ modelRole: 'research' }));
    assert.equal(research.primary.ref.providerId, 'beta');
    assert.equal(research.primary.ref.modelId, 'beta-2');
  });

  it('falls back from an unset role to the primary slot', async () => {
    await harness.settings.setModelRole('primary', { providerId: 'alpha', modelId: 'alpha-1' });
    const fast = await harness.resolver.plan(definition({ modelRole: 'fast' }));
    assert.equal(fast.primary.ref.modelId, 'alpha-1');
  });

  it('prefers an agent override over every shared slot', async () => {
    await harness.settings.setModelRole('primary', { providerId: 'alpha', modelId: 'alpha-1' });
    await harness.settings.updateAgent('test-agent', {
      model: { providerId: 'beta', modelId: 'beta-9' },
    });
    const plan = await harness.resolver.plan(definition());
    assert.equal(plan.primary.ref.providerId, 'beta');
    assert.equal(plan.primary.ref.modelId, 'beta-9');
  });

  it('plans a fallback from the shared slot', async () => {
    await harness.settings.setModelRole('primary', { providerId: 'alpha', modelId: 'alpha-1' });
    await harness.settings.setModelRole('fallback', { providerId: 'beta', modelId: 'beta-1' });
    const plan = await harness.resolver.plan(definition());
    assert.equal(plan.fallback?.ref.providerId, 'beta');
  });

  it('plans no fallback when it would be the same model', async () => {
    // Falling back to the model that just failed is not a fallback, and
    // reporting one would make the run details lie.
    await harness.settings.setModelRole('primary', { providerId: 'alpha', modelId: 'alpha-1' });
    await harness.settings.setModelRole('fallback', { providerId: 'alpha', modelId: 'alpha-1' });
    const plan = await harness.resolver.plan(definition());
    assert.equal(plan.fallback, null);
  });

  it('prefers an agent fallback over the shared one', async () => {
    await harness.settings.setModelRole('primary', { providerId: 'alpha', modelId: 'alpha-1' });
    await harness.settings.setModelRole('fallback', { providerId: 'beta', modelId: 'beta-1' });
    await harness.settings.updateAgent('test-agent', {
      fallbackModel: { providerId: 'beta', modelId: 'beta-special' },
    });
    const plan = await harness.resolver.plan(definition());
    assert.equal(plan.fallback?.ref.modelId, 'beta-special');
  });

  it('drops parameters the provider does not support', async () => {
    // The compatible adapter supports temperature/topP/maxOutputTokens, and
    // has no reasoning effort to give — sending one would be a 400 at best.
    await harness.settings.setModelRole('primary', {
      providerId: 'alpha',
      modelId: 'alpha-1',
      parameters: { temperature: 0.4, reasoningEffort: 'high' },
    });
    const plan = await harness.resolver.plan(definition());
    assert.equal(plan.primary.parameters.temperature, 0.4);
    assert.equal(plan.primary.parameters.reasoningEffort, undefined);
  });

  it('refuses to build a model for a provider that is turned off', async () => {
    await harness.settings.updateProvider('alpha', { enabled: false, apiKey: 'k' });
    await assert.rejects(
      () => harness.providers.createModel('alpha', 'alpha-1'),
      (error: unknown) => error instanceof AgentError && error.code === 'provider_not_configured',
    );
  });

  it('refuses to build a model for a provider missing its credentials', async () => {
    await harness.settings.updateProvider('beta', { enabled: true, baseUrl: 'https://b.test/v1' });
    await assert.rejects(
      () => harness.providers.createModel('beta', 'beta-1'),
      (error: unknown) => error instanceof AgentError && error.code === 'provider_not_configured',
    );
  });

  it('refuses to build a model for a provider that is not registered', async () => {
    await assert.rejects(
      () => harness.providers.createModel('nope', 'x'),
      (error: unknown) => error instanceof AgentError && error.code === 'provider_not_configured',
    );
  });
});

describe('provider registry', () => {
  it('summarises providers without ever returning a key', async () => {
    const harness = await build();
    await harness.settings.updateProvider('alpha', {
      enabled: true,
      apiKey: 'sk-super-secret-value',
      baseUrl: 'https://alpha.test/v1',
      defaultModel: 'alpha-1',
    });

    const summaries = await harness.providers.summaries();
    const alpha = summaries.find((entry) => entry.id === 'alpha');

    assert.equal(alpha?.enabled, true);
    assert.equal(alpha?.configured, true);
    assert.equal(alpha?.apiKeyPreview, 'sk-…alue');
    assert.equal(JSON.stringify(summaries).includes('sk-super-secret-value'), false);
  });

  it('materialises a custom provider from settings and drops it again', async () => {
    const harness = await build();
    await harness.settings.addCustomProvider({
      id: 'gateway',
      name: 'Gateway',
      kind: 'openai-compatible',
    });
    await harness.providers.syncCustomProviders();
    assert.equal(harness.providers.get('gateway')?.name, 'Gateway');

    await harness.settings.removeCustomProvider('gateway');
    await harness.providers.syncCustomProviders();
    assert.equal(harness.providers.get('gateway'), null);
    // Built-ins survive a sync that removed a custom provider.
    assert.equal(harness.providers.get('alpha')?.id, 'alpha');
  });
});
