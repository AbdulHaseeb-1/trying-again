import type { RawNewsItem } from '../normalization/news.normalize';

/**
 * Where stories come from.
 *
 * A provider returns loose records and says nothing about storage, ids or
 * scheduling; normalization and the repository handle those. Adding a source —
 * a vendor feed, a websocket, another scraper — is a class and a registration.
 */
export interface NewsProvider {
  readonly id: string;
  readonly name: string;
  /** False when the provider has nothing configured; it is then skipped quietly. */
  isConfigured(): boolean;
  /** Everything the source currently offers, newest first where it can say. */
  poll(signal?: AbortSignal): Promise<RawNewsItem[]>;
}

export const NEWS_PROVIDERS = Symbol('NEWS_PROVIDERS');
