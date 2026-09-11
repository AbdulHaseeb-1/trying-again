import type { Capability } from '../permissions/permission';

/**
 * Everything Settings → AI & Agents can change, as one versioned document.
 *
 * Secrets are conspicuously absent: an API key is referenced by the provider's
 * id and lives in the secret store. That separation is what lets this document
 * be read, logged and returned to a client without redaction logic.
 */

export type ModelParameters = {
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
};

export type ModelSelection = {
  providerId: string;
  modelId: string;
  parameters?: ModelParameters;
};

/** The four jobs a model can be picked for, independently of provider. */
export type ModelRole = 'primary' | 'research' | 'fast' | 'fallback';

export type ModelRoles = Record<ModelRole, ModelSelection | null>;

export type StoredProviderConfig = {
  enabled: boolean;
  baseUrl: string | null;
  organization: string | null;
  project: string | null;
  headers: Record<string, string>;
  defaultModel: string | null;
  timeoutMs: number;
  maxRetries: number;
};

export type CustomProviderDefinition = {
  id: string;
  name: string;
  /** Only the OpenAI-compatible shape can be added without shipping code. */
  kind: 'openai-compatible';
};

export type AgentOverride = {
  enabled: boolean;
  /** null keeps the agent on the role model its definition asks for. */
  model: ModelSelection | null;
  fallbackModel: ModelSelection | null;
  /** Appended to the definition's instructions, never replacing them. */
  extraInstructions: string | null;
  /** null keeps the definition's capability set; a list narrows it. */
  capabilities: Capability[] | null;
  parameters: ModelParameters;
};

export type StoredSearchProviderConfig = {
  enabled: boolean;
  baseUrl: string | null;
  timeoutMs: number;
};

export type CustomSearchProviderDefinition = {
  id: string;
  name: string;
  /** A SearXNG instance or any JSON endpoint we can normalize. */
  kind: 'searxng' | 'rest';
  baseUrl: string;
};

export type SearchSettings = {
  defaultProviderId: string | null;
  fallbackProviderId: string | null;
  depth: 'basic' | 'advanced';
  maxResults: number;
  /** When non-empty, only these domains may be returned or fetched. */
  allowedDomains: string[];
  blockedDomains: string[];
  /** Drop results older than this. null keeps everything. */
  recencyDays: number | null;
  timeoutMs: number;
  safeSearch: boolean;
  providers: Record<string, StoredSearchProviderConfig>;
  customProviders: CustomSearchProviderDefinition[];
};

export type PrivacySettings = {
  /** Surfaces tool inputs/outputs and run details in the client. */
  debugMode: boolean;
  /** When false, no symbol/timeframe/workspace pointers are sent to a model. */
  shareAppContext: boolean;
  /** When false, conversations are held for the run and then discarded. */
  storeConversations: boolean;
  /** Master switches, above any per-agent capability grant. */
  allowWebAccess: boolean;
  allowNewsAccess: boolean;
};

export type AiSettings = {
  version: 1;
  providers: Record<string, StoredProviderConfig>;
  customProviders: CustomProviderDefinition[];
  models: ModelRoles;
  agents: Record<string, AgentOverride>;
  search: SearchSettings;
  privacy: PrivacySettings;
};

export const DEFAULT_SEARCH_SETTINGS: SearchSettings = {
  defaultProviderId: null,
  fallbackProviderId: null,
  depth: 'basic',
  maxResults: 6,
  allowedDomains: [],
  blockedDomains: [],
  recencyDays: null,
  timeoutMs: 15_000,
  safeSearch: true,
  providers: {},
  customProviders: [],
};

export const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
  debugMode: false,
  shareAppContext: true,
  storeConversations: true,
  allowWebAccess: true,
  allowNewsAccess: true,
};

export function defaultAiSettings(): AiSettings {
  return {
    version: 1,
    providers: {},
    customProviders: [],
    models: { primary: null, research: null, fast: null, fallback: null },
    agents: {},
    search: { ...DEFAULT_SEARCH_SETTINGS, providers: {}, customProviders: [] },
    privacy: { ...DEFAULT_PRIVACY_SETTINGS },
  };
}
