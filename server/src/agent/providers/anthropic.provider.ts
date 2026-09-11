import type { Model } from '@openai/agents';
import { createAnthropic } from '@ai-sdk/anthropic';

import { bridgeAiSdkModel } from './ai-sdk-bridge';
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
  fetchWithTimeout,
  mergeHeaders,
  ProviderHttpError,
  requireApiKey,
  validateBaseUrl,
} from './provider-support';

const DEFAULT_BASE_URL = 'https://api.anthropic.com/v1';

/** Anthropic, bridged into the Agents SDK through the AI SDK adapter. */
export class AnthropicLLMProvider implements LLMProvider {
  readonly id = 'anthropic';
  readonly name = 'Anthropic';
  readonly kind: ProviderKind = 'anthropic';

  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    toolCalling: true,
    structuredOutput: true,
    reasoning: true,
    vision: true,
    images: false,
    webSearch: false,
    mcp: false,
    usageReporting: true,
    defaultContextWindow: 200_000,
  };

  readonly supportedParameters: readonly ModelParameter[] = [
    'temperature',
    'topP',
    'maxOutputTokens',
  ];

  readonly configFields: readonly ProviderConfigField[] = [
    { key: 'apiKey', label: 'API key', required: true, secret: true, placeholder: 'sk-ant-…' },
    { key: 'baseUrl', label: 'Base URL', required: false, secret: false, placeholder: DEFAULT_BASE_URL },
    { key: 'headers', label: 'Custom headers', required: false, secret: false },
    { key: 'timeoutMs', label: 'Timeout (ms)', required: false, secret: false },
    { key: 'maxRetries', label: 'Retries', required: false, secret: false },
  ];

  readonly suggestedModels: readonly ModelDescriptor[] = [
    { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', contextWindow: 200_000 },
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', contextWindow: 200_000 },
    { id: 'claude-opus-4-1', label: 'Claude Opus 4.1', contextWindow: 200_000 },
  ];

  validateConfiguration(config: ProviderConfig): ValidationIssue[] {
    return [...requireApiKey(config), ...validateBaseUrl(config, { required: false })];
  }

  async listModels(config: ProviderConfig, signal?: AbortSignal): Promise<ModelDescriptor[]> {
    const base = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    const response = await fetchWithTimeout(
      `${base}/models?limit=200`,
      { method: 'GET', headers: this.headers(config) },
      config.timeoutMs,
      signal,
    );
    if (!response.ok) throw new ProviderHttpError(response.status, 'models listing failed');
    const body = (await response.json()) as { data?: { id?: string; display_name?: string }[] };
    return (body.data ?? [])
      .filter((row): row is { id: string; display_name?: string } => typeof row.id === 'string')
      .map((row) => ({
        id: row.id,
        label: row.display_name ?? row.id,
        contextWindow: this.capabilities.defaultContextWindow,
      }));
  }

  async createModel(config: ProviderConfig, modelId: string): Promise<Model> {
    const anthropic = createAnthropic({
      apiKey: config.apiKey ?? '',
      baseURL: config.baseUrl ?? DEFAULT_BASE_URL,
      headers: config.headers,
    });
    return bridgeAiSdkModel(anthropic(modelId));
  }

  async testConnection(config: ProviderConfig, signal?: AbortSignal): Promise<ConnectionResult> {
    const issues = this.validateConfiguration(config);
    if (issues.length > 0) return { status: 'not_configured', message: issues[0].message };
    const started = Date.now();
    try {
      const models = await this.listModels(config, signal);
      const latencyMs = Date.now() - started;
      if (config.defaultModel && !models.some((model) => model.id === config.defaultModel)) {
        return {
          status: 'unsupported_model',
          message: `Connected, but "${config.defaultModel}" is not available to this key.`,
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
    return mergeHeaders(
      {
        'x-api-key': config.apiKey ?? '',
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      config.headers,
    );
  }
}
