import type { Model } from '@openai/agents';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

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
  listOpenAIStyleModels,
  mergeHeaders,
  ProviderHttpError,
  requireApiKey,
  validateBaseUrl,
} from './provider-support';

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

/**
 * OpenRouter — the proof that nothing above this layer is OpenAI-shaped.
 *
 * It fronts hundreds of models from a dozen vendors behind one key, which makes
 * it the cheapest way for a user to run this application's agents on something
 * that is not OpenAI, and the natural provider to point the "can a non-OpenAI
 * provider actually run an agent" test at.
 */
export class OpenRouterLLMProvider implements LLMProvider {
  readonly id = 'openrouter';
  readonly name = 'OpenRouter';
  readonly kind: ProviderKind = 'openrouter';

  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    toolCalling: true,
    structuredOutput: true,
    reasoning: true,
    vision: true,
    images: false,
    // OpenRouter exposes web plugins, not the Agents SDK hosted tool: our own
    // web_search tool is the path here.
    webSearch: false,
    mcp: false,
    usageReporting: true,
    defaultContextWindow: 128_000,
  };

  readonly supportedParameters: readonly ModelParameter[] = [
    'temperature',
    'topP',
    'maxOutputTokens',
  ];

  readonly configFields: readonly ProviderConfigField[] = [
    { key: 'apiKey', label: 'API key', required: true, secret: true, placeholder: 'sk-or-…' },
    { key: 'baseUrl', label: 'Base URL', required: false, secret: false, placeholder: DEFAULT_BASE_URL },
    { key: 'headers', label: 'Custom headers', required: false, secret: false },
    { key: 'timeoutMs', label: 'Timeout (ms)', required: false, secret: false },
    { key: 'maxRetries', label: 'Retries', required: false, secret: false },
  ];

  readonly suggestedModels: readonly ModelDescriptor[] = [
    { id: 'openai/gpt-4.1-mini', label: 'OpenAI GPT-4.1 mini', contextWindow: 1_000_000 },
    { id: 'anthropic/claude-sonnet-4.5', label: 'Anthropic Claude Sonnet 4.5', contextWindow: 200_000 },
    { id: 'google/gemini-2.5-flash', label: 'Google Gemini 2.5 Flash', contextWindow: 1_000_000 },
    { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B', contextWindow: 131_072 },
  ];

  validateConfiguration(config: ProviderConfig): ValidationIssue[] {
    return [...requireApiKey(config), ...validateBaseUrl(config, { required: false })];
  }

  async listModels(config: ProviderConfig, signal?: AbortSignal): Promise<ModelDescriptor[]> {
    return listOpenAIStyleModels(
      config.baseUrl ?? DEFAULT_BASE_URL,
      mergeHeaders({ authorization: `Bearer ${config.apiKey ?? ''}` }, config.headers),
      config,
      signal,
    );
  }

  async createModel(config: ProviderConfig, modelId: string): Promise<Model> {
    const openrouter = createOpenRouter({
      apiKey: config.apiKey ?? '',
      baseURL: config.baseUrl ?? DEFAULT_BASE_URL,
      headers: config.headers,
    });
    return bridgeAiSdkModel(openrouter.chat(modelId));
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
          message: `Connected, but "${config.defaultModel}" is not routed by this account.`,
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
}
