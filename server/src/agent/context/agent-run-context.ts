import type { Capability } from '../permissions/permission';

/**
 * What the agent knows without asking.
 *
 * Deliberately pointers, not payloads: a symbol rather than a market snapshot,
 * a conversation id rather than its messages. Everything else is fetched
 * through a tool when the agent decides it needs it, which keeps the prompt
 * small, keeps the data fresh at the moment it is used, and keeps every read
 * inside the permission check.
 */
export type AgentRunContext = {
  /** The authenticated principal. Set by the guard; never by the client body. */
  userId: string;
  deviceId: string;
  sessionId: string;
  conversationId: string;
  runId: string;

  /** What the user is looking at, as reported by the client. */
  selectedSymbol: string | null;
  selectedTimeframe: string | null;
  activeChartId: string | null;
  visibleTimeRange: { from: string; to: string } | null;
  activeWorkspace: string | null;
  /** Explicitly attached context chips, by reference rather than by value. */
  attachments: AgentContextAttachment[];

  locale: string;
  timezone: string;

  /** The capability set the *agent* was configured with, already intersected
   *  with what this principal may delegate. */
  permissions: Capability[];

  /** Debug mode surfaces tool inputs/outputs to the client. Off by default. */
  debug: boolean;
};

export const ATTACHMENT_KINDS = [
  'chart',
  'session',
  'news',
  'market_snapshot',
  'calendar_event',
] as const;

export type AgentContextAttachmentKind = (typeof ATTACHMENT_KINDS)[number];

/** A context chip: what it is and which entity it points at — not its contents. */
export type AgentContextAttachment = {
  kind: AgentContextAttachmentKind;
  id: string;
  label: string;
};

/**
 * The block of text the model actually sees. Short by design — a few hundred
 * characters, all of it pointers.
 */
export function describeContext(context: AgentRunContext): string {
  const lines: string[] = [
    `Current time: ${new Date().toISOString()} (user timezone ${context.timezone}, locale ${context.locale}).`,
  ];
  if (context.selectedSymbol) {
    const timeframe = context.selectedTimeframe ? ` on the ${context.selectedTimeframe} timeframe` : '';
    lines.push(`The user is looking at ${context.selectedSymbol}${timeframe}.`);
  }
  if (context.activeWorkspace) lines.push(`Active workspace: ${context.activeWorkspace}.`);
  if (context.visibleTimeRange) {
    lines.push(
      `Visible chart range: ${context.visibleTimeRange.from} to ${context.visibleTimeRange.to}.`,
    );
  }
  if (context.attachments.length > 0) {
    lines.push(
      `Attached context: ${context.attachments
        .map((item) => `${item.kind}:${item.id} (${item.label})`)
        .join(', ')}. Read them with the matching tool before answering.`,
    );
  }
  lines.push(
    `Available capabilities: ${context.permissions.join(', ') || 'none'}. Tools outside this list do not exist for you.`,
  );
  return lines.join('\n');
}
