/**
 * One vocabulary of failures, shared by the runtime, the tools and the UI.
 *
 * Every error that can reach a user is mapped onto a code here, given a short
 * sentence a person can act on, and marked retryable or not. Stack traces and
 * provider payloads stay in the logs: they leak model names, endpoints and
 * occasionally key fragments, and they never help the person holding a phone.
 */

export const AGENT_ERROR_CODES = [
  'provider_unavailable',
  'provider_not_configured',
  'auth_failed',
  'rate_limited',
  'model_unavailable',
  'timeout',
  'cancelled',
  'tool_unavailable',
  'tool_failed',
  'tool_timeout',
  'permission_denied',
  'search_failed',
  'news_unavailable',
  'context_unavailable',
  'guardrail_blocked',
  'bad_request',
  'internal',
] as const;

export type AgentErrorCode = (typeof AGENT_ERROR_CODES)[number];

export type NormalizedAgentError = {
  code: AgentErrorCode;
  /** One sentence, safe to show. */
  message: string;
  retryable: boolean;
  /** Only populated in debug mode. */
  detail?: string;
};

const MESSAGES: Record<AgentErrorCode, string> = {
  provider_unavailable: 'The AI provider could not be reached. Try again in a moment.',
  provider_not_configured: 'No AI provider is configured. Add one in Settings → AI & Agents.',
  auth_failed: 'The provider rejected the configured credentials.',
  rate_limited: 'The provider is rate limiting this account. Try again shortly.',
  model_unavailable: 'That model is not available on this provider.',
  timeout: 'The request took too long and was stopped.',
  cancelled: 'Request cancelled.',
  tool_unavailable: 'That capability is not available right now.',
  tool_failed: 'A tool failed while gathering data.',
  tool_timeout: 'A tool took too long and was stopped.',
  permission_denied: 'This agent is not permitted to do that.',
  search_failed: 'Web search is unavailable right now.',
  news_unavailable: 'The news service is unavailable right now.',
  context_unavailable: 'The application context could not be read.',
  guardrail_blocked: 'That request was blocked by a safety rule.',
  bad_request: 'The request was not valid.',
  internal: 'Something went wrong.',
};

const RETRYABLE: readonly AgentErrorCode[] = [
  'provider_unavailable',
  'rate_limited',
  'timeout',
  'tool_timeout',
  'search_failed',
  'news_unavailable',
  'internal',
];

export class AgentError extends Error {
  constructor(
    readonly code: AgentErrorCode,
    message?: string,
    readonly detail?: string,
    readonly cause?: unknown,
  ) {
    super(message ?? MESSAGES[code]);
    this.name = 'AgentError';
  }

  normalized(debug = false): NormalizedAgentError {
    return {
      code: this.code,
      message: this.message,
      retryable: RETRYABLE.includes(this.code),
      detail: debug ? this.detail : undefined,
    };
  }
}

/** HTTP status → code, used by every provider and search adapter alike. */
export function codeForStatus(status: number): AgentErrorCode {
  if (status === 401 || status === 403) return 'auth_failed';
  if (status === 404) return 'model_unavailable';
  if (status === 408) return 'timeout';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'provider_unavailable';
  if (status >= 400) return 'bad_request';
  return 'internal';
}

/**
 * Anything thrown anywhere below the runtime, turned into the one shape the
 * transport and the UI understand.
 *
 * The cause chain matters more than it looks. A connection refused inside a
 * model call arrives as `AgentsError: … <- TypeError: fetch failed <- Error:
 * connect ECONNREFUSED`, and only the innermost link says what actually
 * happened. Classifying on the outermost message alone lands every provider
 * outage in "internal" — which then means the fallback model is never tried,
 * because "internal" is deliberately not failover-worthy.
 */
export function normalizeError(error: unknown, debug = false): NormalizedAgentError {
  if (error instanceof AgentError) return error.normalized(debug);

  // An AgentError thrown by a tool can arrive wrapped by the SDK; its code is
  // better than anything inferred from the text around it.
  const nested = findAgentError(error);
  if (nested) return nested.normalized(debug);

  const detail = describeChain(error);
  const lower = detail.toLowerCase();

  // A provider that answered with an HTTP status has already said what went
  // wrong; the SDKs carry it as `status` on the error they throw. Reading it is
  // both more accurate than matching on words and the only way a 5xx becomes
  // "the provider could not be reached" rather than "something went wrong" —
  // which also decides whether the run is worth failing over to another model.
  const status = findStatus(error);
  if (status !== null) {
    const fromStatus = codeForStatus(status);
    return {
      code: fromStatus,
      message: MESSAGES[fromStatus],
      retryable: RETRYABLE.includes(fromStatus),
      detail: debug ? detail : undefined,
    };
  }

  const code: AgentErrorCode = (() => {
    if (lower.includes('abort') || lower.includes('cancel')) return 'cancelled';
    if (lower.includes('timeout') || lower.includes('timed out')) return 'timeout';
    if (lower.includes('429') || lower.includes('rate limit')) return 'rate_limited';
    if (lower.includes('401') || lower.includes('403') || lower.includes('unauthorized')) {
      return 'auth_failed';
    }
    if (
      lower.includes('enotfound') ||
      lower.includes('econnrefused') ||
      lower.includes('econnreset') ||
      lower.includes('ehostunreach') ||
      lower.includes('fetch failed') ||
      lower.includes('socket hang up') ||
      lower.includes('network')
    ) {
      return 'provider_unavailable';
    }
    if (lower.includes('guardrail') || lower.includes('tripwire')) return 'guardrail_blocked';
    return 'internal';
  })();

  return {
    code,
    message: MESSAGES[code],
    retryable: RETRYABLE.includes(code),
    detail: debug ? detail : undefined,
  };
}

/** The first HTTP status carried anywhere in the cause chain, if there is one. */
function findStatus(error: unknown): number | null {
  const seen = new Set<unknown>();
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current !== undefined && current !== null; depth += 1) {
    if (seen.has(current)) break;
    seen.add(current);
    if (typeof current === 'object') {
      const candidate = current as { status?: unknown; statusCode?: unknown; cause?: unknown };
      for (const value of [candidate.status, candidate.statusCode]) {
        if (typeof value === 'number' && value >= 400 && value <= 599) return value;
      }
      current = candidate.cause;
      continue;
    }
    break;
  }
  return null;
}

/** The whole cause chain as one searchable string, bounded so a cycle cannot hang. */
function describeChain(error: unknown): string {
  const parts: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current !== undefined && current !== null; depth += 1) {
    if (seen.has(current)) break;
    seen.add(current);
    if (current instanceof Error) {
      parts.push(`${current.name}: ${current.message}`);
      current = (current as { cause?: unknown }).cause;
      continue;
    }
    parts.push(String(current));
    break;
  }
  return parts.join(' <- ');
}

function findAgentError(error: unknown): AgentError | null {
  const seen = new Set<unknown>();
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current !== undefined && current !== null; depth += 1) {
    if (seen.has(current)) break;
    seen.add(current);
    if (current instanceof AgentError) return current;
    if (!(current instanceof Error)) break;
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

/** True when a failure is worth re-trying on a *different* provider. */
export function isFailoverWorthy(error: NormalizedAgentError): boolean {
  return (
    error.code === 'provider_unavailable' ||
    error.code === 'timeout' ||
    error.code === 'rate_limited' ||
    error.code === 'model_unavailable'
  );
}
