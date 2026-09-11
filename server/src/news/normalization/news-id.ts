import { createHash } from 'node:crypto';

/**
 * A news item's identity.
 *
 * Deterministic rather than random, and derived from the provider's own key,
 * so re-ingesting the same feed produces the same id: a citation written into a
 * stored answer last week still resolves after a hundred refreshes, and a
 * duplicate arriving through two paths collapses into one row.
 */
export function newsId(provider: string, providerItemId: string): string {
  const digest = createHash('sha256').update(`${provider} ${providerItemId}`).digest('base64url');
  return `news_${digest.slice(0, 22)}`;
}

/** The provider key to hash when a feed gives no id of its own. */
export function fallbackItemKey(parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join('|');
}
