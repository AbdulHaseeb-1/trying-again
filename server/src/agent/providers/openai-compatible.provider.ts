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

/**
 * Any endpoint that speaks the OpenAI Chat Completions dialect: a self-hosted
 * vLLM or Ollama gateway, an enterprise proxy, a vendor that ships an
 * OpenAI-shaped surface.
 *
 * Capabilities are declared conservatively — Chat Completions has no hosted
 * web search, no reasoning summaries and no MCP — so nothing above tries to use
 * a feature the endpoint cannot honour. The class is constructed with an id and
 * a name so several such endpoints can be registered side by side.
 */
export class OpenAiCompatibleLLMProvider implements LLMProvider {
  readonly kind: ProviderKind = 'openai-compatible';

  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    toolCalling: true,
    structuredOutput: false,
    reasoning: false,
    vision: false,
    images: false,
    webSearch: false,
    mcp: false,
    usageReporting: true,
    defaultContextWindow: 32_000,
  };

  readonly supportedParameters: readonly ModelParameter[] = [
    'temperature',
    'topP',
    'maxOutputTokens',
  ];

  readonly configFields: readonly ProviderConfigField[] = [
    {
      key: 'baseUrl',
      label: 'Base URL',
      required: true,
      secret: false,
      placeholder: 'https://gateway.example.com/v1',
    },
    { key: 'apiKey', label: 'API key', required: true, secret: true },
    {
      key: 'headers',
      label: 'Custom headers',
      required: false,
      secret: false,
      help: 'Sent with every request. Authorization cannot be overridden here.',
    },
    { key: 'timeoutMs', label: 'Timeout (ms)', required: false, secret: false },
    { key: 'maxRetries', label: 'Retries', required: false, secret: false },
  ];

  readonly suggestedModels: readonly ModelDescriptor[] = [];

  constructor(
    readonly id: string,
    readonly name: string,
  ) {}

  validateConfiguration(config: ProviderConfig): ValidationIssue[] {
    return [...requireApiKey(config), ...validateBaseUrl(config, { required: true })];
  }

  async listModels(config: ProviderConfig, signal?: AbortSignal): Promise<ModelDescriptor[]> {
    if (!config.baseUrl) return [];
    return listOpenAIStyleModels(config.baseUrl, this.headers(config), config, signal);
  }

  async createModel(config: ProviderConfig, modelId: string): Promise<Model> {
    const provider = new AgentsOpenAIProvider({
      apiKey: config.apiKey ?? undefined,
      baseURL: config.baseUrl ?? undefined,
      // Compatible endpoints implement Chat Completions, not Responses.
      useResponses: false,
    });
    return provider.getModel(modelId);
  }

  async testConnection(config: ProviderConfig, signal?: AbortSignal): Promise<ConnectionResult> {
    const issues = this.validateConfiguration(config);
    if (issues.length > 0) return { status: 'not_configured', message: issues[0].message };
    const started = Date.now();
    try {
      const models = await this.listModels(config, signal);
      return {
        status: 'connected',
        message: `Connected. ${models.length} models available.`,
        latencyMs: Date.now() - started,
        modelsDiscovered: models.length,
      };
    } catch (error) {
      if (error instanceof ProviderHttpError) return describeStatus(error.status);
      return describeTransportFailure(error);
    }
  }

  private headers(config: ProviderConfig): Record<string, string> {
    return mergeHeaders(
      { authorization: `Bearer ${config.apiKey ?? ''}`, 'content-type': 'application/json' },
      config.headers,
    );
  }
}
