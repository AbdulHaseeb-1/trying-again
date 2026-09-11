/**
 * What an agent is allowed to reach.
 *
 * Two orthogonal ideas, kept separate on purpose:
 *
 *  - a **capability** is a named slice of the application ("news, read-only").
 *    Tools declare one; agent definitions grant a set of them. A tool the agent
 *    was not granted is never even described to the model, so an agent cannot
 *    talk its way into a capability it does not hold.
 *  - a **level** says how dangerous the call is regardless of which slice it
 *    touches. It drives the confirmation policy, not the allow-list.
 *
 * Authorization is decided here, in code, before the tool runs. The model is
 * never asked whether a call is permitted.
 */

export const PERMISSION_LEVELS = [
  'READ',
  'WRITE',
  'EXTERNAL_NETWORK',
  'SENSITIVE',
  'CONFIRM_REQUIRED',
] as const;

export type PermissionLevel = (typeof PERMISSION_LEVELS)[number];

/** Every capability the application exposes to agents. */
export const CAPABILITIES = [
  'market.read',
  'chart.read',
  'chart.write',
  'news.read',
  'app.read',
  'web.search',
  'web.fetch',
  'alerts.write',
  'settings.write',
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export function isCapability(value: string): value is Capability {
  return (CAPABILITIES as readonly string[]).includes(value);
}

/** Human labels, used by the settings UI and by permission-denied messages. */
export const CAPABILITY_LABELS: Record<Capability, string> = {
  'market.read': 'Read market data',
  'chart.read': 'Read the current chart',
  'chart.write': 'Change the chart',
  'news.read': 'Read application news',
  'app.read': 'Read workspace and session context',
  'web.search': 'Search the web',
  'web.fetch': 'Open a web page',
  'alerts.write': 'Create alerts',
  'settings.write': 'Change settings',
};

/**
 * Levels that may never run without an explicit human decision, whatever the
 * agent definition says.
 */
const ALWAYS_CONFIRM: readonly PermissionLevel[] = ['CONFIRM_REQUIRED'];

export function requiresApproval(level: PermissionLevel): boolean {
  return ALWAYS_CONFIRM.includes(level);
}

export type PermissionDecision =
  | { allowed: true; needsApproval: boolean }
  | { allowed: false; reason: string };

/**
 * The one place a tool call is authorized.
 *
 * `granted` is the agent's configured capability set — not the union of every
 * tool that happens to be registered.
 */
export function decide(
  required: Capability,
  level: PermissionLevel,
  granted: readonly Capability[],
): PermissionDecision {
  if (!granted.includes(required)) {
    return {
      allowed: false,
      reason: `This agent is not permitted to ${CAPABILITY_LABELS[required].toLowerCase()}.`,
    };
  }
  return { allowed: true, needsApproval: requiresApproval(level) };
}
