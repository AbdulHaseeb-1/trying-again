import { createHash } from 'node:crypto';

import type { AgentMessageReference, AgentReference, AgentReferenceType } from './reference.types';

/**
 * The rule this class exists to make structurally true:
 *
 *   **a citation shown in the UI always maps to a source a tool returned.**
 *
 * References are added here by the tool layer, from provider data, and given
 * their display index at that moment. The model is told to cite by index. When
 * the answer comes back, `sanitize` removes every marker that does not resolve
 * to a registered reference — so a model that invents "[7]" produces text with
 * no seventh citation rather than a footnote to nowhere.
 *
 * One collector per run. It is deliberately not injectable: two concurrent runs
 * must never share an index space.
 */
export class RunCitations {
  private readonly byId = new Map<string, AgentMessageReference>();

  /** Register a source and return its display index, deduplicating by id. */
  add(reference: AgentReference): AgentMessageReference {
    const existing = this.byId.get(reference.id);
    if (existing) return existing;
    const entry: AgentMessageReference = { ...reference, citationIndex: this.byId.size + 1 };
    this.byId.set(reference.id, entry);
    return entry;
  }

  addAll(references: AgentReference[]): AgentMessageReference[] {
    return references.map((reference) => this.add(reference));
  }

  get size(): number {
    return this.byId.size;
  }

  all(): AgentMessageReference[] {
    return [...this.byId.values()].sort((a, b) => a.citationIndex - b.citationIndex);
  }

  /** The list handed to the model so it knows what it may cite. */
  describeForModel(): string {
    if (this.byId.size === 0) return '';
    return this.all()
      .map((reference) => {
        const when = reference.publishedAt ? ` · ${reference.publishedAt.slice(0, 10)}` : '';
        return `[${reference.citationIndex}] ${reference.title} — ${reference.source ?? reference.type}${when}`;
      })
      .join('\n');
  }

  /**
   * Strip markers that point at nothing.
   *
   * Only out-of-range indices are removed; an in-range `[2]` is left exactly as
   * the model wrote it, because that one *does* resolve. Ranges and lists
   * (`[1,3]`, `[1-3]`) are handled so a partly-valid marker does not survive
   * with an invented member still inside it.
   */
  sanitize(text: string): string {
    if (!text) return text;
    const max = this.byId.size;
    return text
      .replace(/\[(\d+(?:\s*[,–—-]\s*\d+)*)\]/g, (marker, body: string) => {
        const numbers = body
          .split(/[\s,–—-]+/)
          .map((part) => Number.parseInt(part, 10))
          .filter((value) => Number.isFinite(value));
        const kept = numbers.filter((value) => value >= 1 && value <= max);
        if (kept.length === 0) return '';
        return `[${kept.join(', ')}]`;
      })
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/ +([.,;:])/g, '$1')
      .trim();
  }

  /** References actually cited in the final text, in first-appearance order. */
  used(text: string): AgentMessageReference[] {
    const cited = new Set<number>();
    for (const match of text.matchAll(/\[(\d+(?:\s*,\s*\d+)*)\]/g)) {
      for (const part of match[1].split(/\s*,\s*/)) {
        const value = Number.parseInt(part, 10);
        if (Number.isFinite(value)) cited.add(value);
      }
    }
    return this.all().filter((reference) => cited.has(reference.citationIndex));
  }
}

/**
 * Reference identity. Derived from type and a natural key so the same source
 * cited by two different tools, or in two different runs, is one row.
 */
export function referenceId(type: AgentReferenceType, key: string): string {
  return `ref_${createHash('sha256').update(`${type} ${key}`).digest('base64url').slice(0, 20)}`;
}
