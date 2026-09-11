import type { Model } from '@openai/agents';
import { OpenAIProvider as AgentsOpenAIProvider } from '@openai/agents';

import type {
  ConnectionResult,
  LLMProvider,
  ModelDescriptor,
  ModelParameter,
  ProviderCapabilities,
  ProviderConfig,
  ProviderConfigField,
  ProviderKind,
  ValidationIssue,
} from './llm-provider';
import {
  describeStatus,
  describeTransportFailure,
  listOpenAIStyleModels,
  mergeHeaders,
  ProviderHttpError,
  requireApiKey,
  validateBaseUrl,
} from './provider-support';

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

/**
 * OpenAI, through the Agents SDK's own model provider.
 *
 * This is the one provider that does *not* go through the AI SDK bridge: the
 * SDK's Responses implementation is what hosted tools, reasoning summaries and
 * tracing are built against, and routing it through an adapter would lose all
 * three for no gain.
 */
export class OpenAiLLMProvider implements LLMProvider {
  readonly id = 'openai';
  readonly name = 'OpenAI';
  readonly kind: ProviderKind = 'openai';

  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    toolCalling: true,
    structuredOutput: true,
    reasoning: true,
    vision: true,
    images: true,
    webSearch: true,
    mcp: true,
    usageReporting: true,
    defaultContextWindow: 128_000,
  };

  readonly supportedParameters: readonly ModelParameter[] = [
    'temperature',
    'topP',
    'maxOutputTokens',
    'reasoningEffort',
  ];

  readonly configFields: readonly ProviderConfigField[] = [
    { key: 'apiKey', label: 'API key', required: true, secret: true, placeholder: 'sk-…' },
    {
      key: 'baseUrl',
      label: 'Base URL',
      required: false,
      secret: false,
      placeholder: DEFAULT_BASE_URL,
      help: 'Point at a compatible gateway or a regional endpoint.',
    },
    { key: 'organization', label: 'Organization', required: false, secret: false },
    { key: 'project', label: 'Project', required: false, secret: false },
    { key: 'timeoutMs', label: 'Timeout (ms)', required: false, secret: false },
    { key: 'maxRetries', label: 'Retries', required: false, secret: false },
  ];

  readonly suggestedModels: readonly ModelDescriptor[] = [
    { id: 'gpt-5', label: 'GPT-5', contextWindow: 400_000 },
    { id: 'gpt-5-mini', label: 'GPT-5 mini', contextWindow: 400_000 },
    { id: 'gpt-4.1', label: 'GPT-4.1', contextWindow: 1_000_000 },
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini', contextWindow: 1_000_000 },
    { id: 'gpt-4o', label: 'GPT-4o', contextWindow: 128_000 },
    { id: 'gpt-4o-mini', label: 'GPT-4o mini', contextWindow: 128_000 },
  ];

  validateConfiguration(config: ProviderConfig): ValidationIssue[] {
    return [...requireApiKey(config), ...validateBaseUrl(config, { required: false })];
  }

  async listModels(config: ProviderConfig, signal?: AbortSignal): Promise<ModelDescriptor[]> {
    return listOpenAIStyleModels(config.baseUrl ?? DEFAULT_BASE_URL, this.headers(config), config, signal);
  }

  async createModel(config: ProviderConfig, modelId: string): Promise<Model> {
    const provider = new AgentsOpenAIProvider({
      apiKey: config.apiKey ?? undefined,
      baseURL: config.baseUrl ?? undefined,
      organization: config.organization ?? undefined,
      project: config.project ?? undefined,
      useResponses: true,
    });
    return provider.getModel(modelId);
  }

  async testConnection(config: ProviderConfig, signal?: AbortSignal): Promise<ConnectionResult> {
    const issues = this.validateConfiguration(config);
    if (issues.length > 0) {
      return { status: 'not_configured', message: issues[0].message };
    }
    const started = Date.now();
    try {
      const models = await this.listModels(config, signal);
      const latencyMs = Date.now() - started;
      if (config.defaultModel && !models.some((model) => model.id === config.defaultModel)) {
        return {
          status: 'unsupported_model',
          message: `Connected, but "${config.defaultModel}" is not offered by this endpoint.`,
          latencyMs,
          modelsDiscovered: models.length,
        };
      }
      return {
        status: 'connected',
        message: `Connected. ${models.length} models available.`,
        latencyMs,
        modelsDiscovered: models.length,
      };
    } catch (error) {
      if (error instanceof ProviderHttpError) return describeStatus(error.status);
      return describeTransportFailure(error);
    }
  }

  private headers(config: ProviderConfig): Record<string, string> {
    const base: Record<string, string> = {
      authorization: `Bearer ${config.apiKey ?? ''}`,
      'content-type': 'application/json',
    };
    if (config.organization) base['openai-organization'] = config.organization;
    if (config.project) base['openai-project'] = config.project;
    return mergeHeaders(base, config.headers);
  }
}
