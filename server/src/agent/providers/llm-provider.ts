import type { Model } from '@openai/agents';

/**
 * The seam that keeps the application off any single vendor.
 *
 * Everything above this file — agents, tools, the runtime, the settings API —
 * talks about "a provider and a model id". Everything vendor-shaped lives in an
 * implementation of this interface. Adding a vendor means writing one class and
 * registering it; nothing else changes, and there is no switch statement to
 * extend.
 */

export const PROVIDER_KINDS = [
  'openai',
  'openai-compatible',
  'anthropic',
  'google',
  'openrouter',
  'custom',
] as const;

export type ProviderKind = (typeof PROVIDER_KINDS)[number];

/**
 * What a provider can actually do. Nothing above assumes a feature exists —
 * the settings UI hides parameters a provider does not support, and the agent
 * factory refuses to attach, say, a hosted web-search tool to a provider that
 * has none instead of failing at request time.
 */
export type ProviderCapabilities = {
  streaming: boolean;
  toolCalling: boolean;
  structuredOutput: boolean;
  reasoning: boolean;
  vision: boolean;
  images: boolean;
  /** A *hosted* web search executed by the provider, not our own tool. */
  webSearch: boolean;
  mcp: boolean;
  usageReporting: boolean;
  /** Fallback when a model does not report its own. */
  defaultContextWindow: number;
};

/** Tunable model parameters, declared per provider so the UI can hide the rest. */
export const MODEL_PARAMETERS = [
  'temperature',
  'topP',
  'maxOutputTokens',
  'reasoningEffort',
] as const;

export type ModelParameter = (typeof MODEL_PARAMETERS)[number];

export type ProviderConfigField = {
  key: 'apiKey' | 'baseUrl' | 'organization' | 'project' | 'headers' | 'timeoutMs' | 'maxRetries';
  label: string;
  required: boolean;
  /** Secrets are write-only over the API: stored, never read back. */
  secret: boolean;
  placeholder?: string;
  help?: string;
};

export type ProviderConfig = {
  providerId: string;
  enabled: boolean;
  /** Resolved from the secret store at call time. Never serialised to a client. */
  apiKey: string | null;
  baseUrl: string | null;
  organization: string | null;
  project: string | null;
  headers: Record<string, string>;
  defaultModel: string | null;
  timeoutMs: number;
  maxRetries: number;
};

export const DEFAULT_PROVIDER_CONFIG: Omit<ProviderConfig, 'providerId'> = {
  enabled: false,
  apiKey: null,
  baseUrl: null,
  organization: null,
  project: null,
  headers: {},
  defaultModel: null,
  timeoutMs: 60_000,
  maxRetries: 2,
};

export type ModelDescriptor = {
  id: string;
  label: string;
  contextWindow: number | null;
  /** Overrides for this model where it differs from the provider default. */
  capabilities?: Partial<ProviderCapabilities>;
};

export type ConnectionStatus =
  | 'connected'
  | 'not_configured'
  | 'auth_failed'
  | 'unreachable'
  | 'unsupported_model'
  | 'rate_limited'
  | 'error';

export type ConnectionResult = {
  status: ConnectionStatus;
  /** Safe to show. Never contains the key, the full URL or a provider payload. */
  message: string;
  latencyMs?: number;
  modelsDiscovered?: number;
};

export type ValidationIssue = { field: string; message: string };

export interface LLMProvider {
  readonly id: string;
  readonly name: string;
  readonly kind: ProviderKind;
  readonly capabilities: ProviderCapabilities;
  readonly supportedParameters: readonly ModelParameter[];
  readonly configFields: readonly ProviderConfigField[];
  /** Models to offer before (or instead of) a successful `listModels`. */
  readonly suggestedModels: readonly ModelDescriptor[];

  listModels(config: ProviderConfig, signal?: AbortSignal): Promise<ModelDescriptor[]>;
  createModel(config: ProviderConfig, modelId: string): Promise<Model>;
  validateConfiguration(config: ProviderConfig): ValidationIssue[];
  testConnection(config: ProviderConfig, signal?: AbortSignal): Promise<ConnectionResult>;
}

/** What the settings UI is told about a provider — no secrets, ever. */
export type ProviderSummary = {
  id: string;
  name: string;
  kind: ProviderKind;
  enabled: boolean;
  configured: boolean;
  /** "sk-…3f9" — enough to recognise a key, not enough to use one. */
  apiKeyPreview: string | null;
  baseUrl: string | null;
  defaultModel: string | null;
  timeoutMs: number;
  maxRetries: number;
  capabilities: ProviderCapabilities;
  supportedParameters: ModelParameter[];
  configFields: ProviderConfigField[];
  suggestedModels: ModelDescriptor[];
};
