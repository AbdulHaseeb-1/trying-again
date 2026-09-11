/**
 * Wire types for the agent API, mirrored from the NestJS service.
 *
 * The same convention the calendar and derivatives clients already follow: one
 * file that describes the wire, so no component ever reaches into raw JSON and
 * no component ever learns which model vendor produced a token.
 */

export type AgentReferenceType =
  | 'news'
  | 'web'
  | 'market_data'
  | 'chart'
  | 'document'
  | 'application_entity';

export type AgentReference = {
  id: string;
  type: AgentReferenceType;
  title: string;
  url?: string | null;
  source?: string | null;
  publishedAt?: string | null;
  entityId?: string | null;
  snippet?: string | null;
  metadata?: Record<string, unknown>;
};

export type AgentMessageReference = AgentReference & { citationIndex: number };

export type ModelRef = { providerId: string; providerName: string; modelId: string };

export type AgentToolStatus = 'running' | 'completed' | 'failed';

export type AgentToolRun = {
  id: string;
  tool: string;
  label: string;
  status: AgentToolStatus;
  startedAt: string;
  durationMs?: number;
  summary?: string;
  input?: unknown;
  output?: unknown;
  error?: NormalizedAgentError;
};

export type NormalizedAgentError = {
  code: string;
  message: string;
  retryable: boolean;
  detail?: string;
};

export type AgentUsage = {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type AgentEvent =
  | { type: 'RUN_STARTED'; runId: string; conversationId: string; agentId: string; at: string }
  | { type: 'AGENT_STARTED'; runId: string; agentId: string; agentName: string; at: string }
  | { type: 'MODEL_STARTED'; runId: string; model: ModelRef; at: string }
  | {
      type: 'MODEL_FALLBACK';
      runId: string;
      from: ModelRef;
      to: ModelRef;
      reason: NormalizedAgentError;
      at: string;
    }
  | { type: 'TEXT_DELTA'; runId: string; messageId: string; delta: string }
  | { type: 'STATUS'; runId: string; text: string }
  | { type: 'TOOL_STARTED'; runId: string; run: AgentToolRun }
  | { type: 'TOOL_COMPLETED'; runId: string; run: AgentToolRun }
  | { type: 'TOOL_FAILED'; runId: string; run: AgentToolRun }
  | { type: 'HANDOFF'; runId: string; from: string; to: string; at: string }
  | { type: 'REFERENCE_ADDED'; runId: string; reference: AgentReference; citationIndex: number }
  | {
      type: 'MESSAGE_COMPLETED';
      runId: string;
      messageId: string;
      text: string;
      references: AgentMessageReference[];
      toolRuns: AgentToolRun[];
      model: ModelRef | null;
      agentId: string;
    }
  | { type: 'RUN_COMPLETED'; runId: string; usage: AgentUsage; durationMs: number }
  | { type: 'RUN_FAILED'; runId: string; error: NormalizedAgentError; durationMs: number }
  | { type: 'RUN_CANCELLED'; runId: string; durationMs: number };

export const ATTACHMENT_KINDS = [
  'chart',
  'session',
  'news',
  'market_snapshot',
  'calendar_event',
] as const;

export type AgentContextAttachmentKind = (typeof ATTACHMENT_KINDS)[number];

export type AgentContextAttachment = {
  kind: AgentContextAttachmentKind;
  id: string;
  label: string;
};

export type AgentMessageRole = 'user' | 'assistant' | 'system';

export type AgentMessage = {
  id: string;
  conversationId: string;
  role: AgentMessageRole;
  text: string;
  createdAt: string;
  agentId: string | null;
  model: ModelRef | null;
  references: AgentMessageReference[];
  toolRuns: AgentToolRun[];
  attachments: AgentContextAttachment[];
  error: NormalizedAgentError | null;
};

export type AgentConversation = {
  id: string;
  title: string;
  agentId: string;
  createdAt: string;
  updatedAt: string;
  pinned: boolean;
  messageCount: number;
  context: { symbol: string | null; timeframe: string | null; workspace: string | null };
  lastModel: ModelRef | null;
};

export type AgentCapability =
  | 'market.read'
  | 'chart.read'
  | 'chart.write'
  | 'news.read'
  | 'app.read'
  | 'web.search'
  | 'web.fetch'
  | 'alerts.write'
  | 'settings.write';

export type AgentSummary = {
  id: string;
  name: string;
  description: string;
  capabilities: AgentCapability[];
  modelRole: string;
  userFacing: boolean;
  starters: string[];
  model: { providerId: string; modelId: string } | null;
  fallbackModel: { providerId: string; modelId: string } | null;
  enabled: boolean;
  toolNames: string[];
};

export type AgentToolSummary = {
  name: string;
  description: string;
  domain: string;
  capability: AgentCapability;
  level: string;
  timeoutMs: number;
};

export type AgentBootstrap = {
  principal: { userId: string; deviceId: string };
  /** False until at least one provider and model are configured. */
  ready: boolean;
  defaultAgentId: string;
  agents: AgentSummary[];
  tools: AgentToolSummary[];
  privacy: {
    debugMode: boolean;
    shareAppContext: boolean;
    storeConversations: boolean;
    allowWebAccess: boolean;
    allowNewsAccess: boolean;
  };
  search: { defaultProviderId: string | null; enabled: boolean };
  storage: string;
  newsStorage: string;
};

export type NewsImportance = 'low' | 'medium' | 'high' | 'critical';

export type NewsItem = {
  id: string;
  title: string;
  summary: string | null;
  body: string | null;
  source: string;
  sourceUrl: string | null;
  canonicalUrl: string | null;
  publishedAt: string;
  receivedAt: string;
  symbols: string[];
  categories: string[];
  importance: NewsImportance;
  sentiment: 'bullish' | 'bearish' | 'neutral' | null;
  provider: string;
  providerItemId: string | null;
  metadata: Record<string, unknown>;
};

export type NewsPage = { items: NewsItem[]; nextCursor: string | null; total: number };

// ------------------------------------------------------------------ settings

export type ProviderCapabilities = {
  streaming: boolean;
  toolCalling: boolean;
  structuredOutput: boolean;
  reasoning: boolean;
  vision: boolean;
  images: boolean;
  webSearch: boolean;
  mcp: boolean;
  usageReporting: boolean;
  defaultContextWindow: number;
};

export type ProviderConfigField = {
  key: 'apiKey' | 'baseUrl' | 'organization' | 'project' | 'headers' | 'timeoutMs' | 'maxRetries';
  label: string;
  required: boolean;
  secret: boolean;
  placeholder?: string;
  help?: string;
};

export type ModelDescriptor = {
  id: string;
  label: string;
  contextWindow: number | null;
};

export type ProviderSummary = {
  id: string;
  name: string;
  kind: string;
  enabled: boolean;
  configured: boolean;
  /** A preview, never the key itself — the server has no endpoint that returns one. */
  apiKeyPreview: string | null;
  baseUrl: string | null;
  defaultModel: string | null;
  timeoutMs: number;
  maxRetries: number;
  capabilities: ProviderCapabilities;
  supportedParameters: string[];
  configFields: ProviderConfigField[];
  suggestedModels: ModelDescriptor[];
};

export type ConnectionResult = {
  status:
    | 'connected'
    | 'not_configured'
    | 'auth_failed'
    | 'unreachable'
    | 'unsupported_model'
    | 'rate_limited'
    | 'error';
  message: string;
  latencyMs?: number;
  modelsDiscovered?: number;
};

export type SearchProviderSummary = {
  id: string;
  name: string;
  configured: boolean;
  enabled: boolean;
  apiKeyPreview: string | null;
  baseUrl: string | null;
  capabilities: {
    fullTextFetch: boolean;
    domainFilter: boolean;
    recencyFilter: boolean;
    safeSearch: boolean;
    scores: boolean;
    requiresApiKey: boolean;
    requiresBaseUrl: boolean;
  };
};

export type SearchHealth = {
  status: 'ok' | 'not_configured' | 'auth_failed' | 'unreachable' | 'rate_limited' | 'error';
  message: string;
  latencyMs?: number;
};

export type ModelSelection = { providerId: string; modelId: string } | null;

export type AiSettings = {
  providers: ProviderSummary[];
  customProviders: { id: string; name: string; kind: string }[];
  models: { primary: ModelSelection; research: ModelSelection; fast: ModelSelection; fallback: ModelSelection };
  agents: AgentSummary[];
  agentOverrides: Record<string, unknown>;
  tools: AgentToolSummary[];
  capabilities: { id: AgentCapability; label: string }[];
  search: {
    defaultProviderId: string | null;
    fallbackProviderId: string | null;
    depth: 'basic' | 'advanced';
    maxResults: number;
    allowedDomains: string[];
    blockedDomains: string[];
    recencyDays: number | null;
    timeoutMs: number;
    safeSearch: boolean;
    providers: SearchProviderSummary[];
    customProviders: { id: string; name: string; kind: string; baseUrl: string }[];
  };
  privacy: {
    debugMode: boolean;
    shareAppContext: boolean;
    storeConversations: boolean;
    allowWebAccess: boolean;
    allowNewsAccess: boolean;
  };
};

export type AgentRunRecord = {
  id: string;
  conversationId: string;
  agentId: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  firstTokenMs: number | null;
  usage: AgentUsage;
  model: ModelRef | null;
  fallbackFrom: ModelRef | null;
  toolCalls: number;
  toolFailures: number;
  handoffs: number;
  searchProvider: string | null;
  referenceCount: number;
  errorCode: string | null;
};
