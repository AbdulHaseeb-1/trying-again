import type { Model } from '@openai/agents';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

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

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

/** Google Gemini, bridged into the Agents SDK through the AI SDK adapter. */
export class GoogleLLMProvider implements LLMProvider {
  readonly id = 'google';
  readonly name = 'Google';
  readonly kind: ProviderKind = 'google';

  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    toolCalling: true,
    structuredOutput: true,
    reasoning: true,
    vision: true,
    images: true,
    webSearch: false,
    mcp: false,
    usageReporting: true,
    defaultContextWindow: 1_000_000,
  };

  readonly supportedParameters: readonly ModelParameter[] = [
    'temperature',
    'topP',
    'maxOutputTokens',
  ];

  readonly configFields: readonly ProviderConfigField[] = [
    { key: 'apiKey', label: 'API key', required: true, secret: true },
    { key: 'baseUrl', label: 'Base URL', required: false, secret: false, placeholder: DEFAULT_BASE_URL },
    { key: 'timeoutMs', label: 'Timeout (ms)', required: false, secret: false },
    { key: 'maxRetries', label: 'Retries', required: false, secret: false },
  ];

  readonly suggestedModels: readonly ModelDescriptor[] = [
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', contextWindow: 1_000_000 },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', contextWindow: 1_000_000 },
  ];

  validateConfiguration(config: ProviderConfig): ValidationIssue[] {
    return [...requireApiKey(config), ...validateBaseUrl(config, { required: false })];
  }

  async listModels(config: ProviderConfig, signal?: AbortSignal): Promise<ModelDescriptor[]> {
    const base = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    const response = await fetchWithTimeout(
      `${base}/models`,
      { method: 'GET', headers: this.headers(config) },
      config.timeoutMs,
      signal,
    );
    if (!response.ok) throw new ProviderHttpError(response.status, 'models listing failed');
    const body = (await response.json()) as {
      models?: {
        name?: string;
        displayName?: string;
        inputTokenLimit?: number;
        supportedGenerationMethods?: string[];
      }[];
    };
    return (body.models ?? [])
      .filter((row) => typeof row.name === 'string')
      .filter((row) => (row.supportedGenerationMethods ?? []).includes('generateContent'))
      .map((row) => ({
        id: row.name!.replace(/^models\//, ''),
        label: row.displayName ?? row.name!,
        contextWindow: row.inputTokenLimit ?? null,
      }));
  }

  async createModel(config: ProviderConfig, modelId: string): Promise<Model> {
    const google = createGoogleGenerativeAI({
      apiKey: config.apiKey ?? '',
      baseURL: config.baseUrl ?? DEFAULT_BASE_URL,
      headers: config.headers,
    });
    return bridgeAiSdkModel(google(modelId));
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
      { 'x-goog-api-key': config.apiKey ?? '', 'content-type': 'application/json' },
      config.headers,
    );
  }
}
