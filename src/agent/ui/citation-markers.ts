/**
 * The renderer's half of the "citations cannot be fabricated" rule.
 *
 * The server already strips markers that resolve to nothing, so in practice the
 * text reaching a component is clean. This is the second lock on the same door:
 * the component renders a chip only for an index that is actually present on
 * the message it belongs to, so a stored message from an older build, a
 * hand-edited payload, or a future bug upstream still cannot produce a footnote
 * pointing at nothing.
 *
 * Kept as a plain function, separate from the JSX, so it can be tested without
 * a renderer.
 */

/** The pattern the inline renderer splits on. Exported so both stay in step. */
export const CITATION_PATTERN = /^\[(\d+(?:,\s*\d+)*)\]$/;

/**
 * The indices a marker should render, given how many sources the message has.
 *
 * An empty result means "render nothing at all" — not "render an empty
 * bracket", which would leave visible punctuation with no meaning.
 */
export function citationIndices(marker: string, available: number): number[] {
  const match = CITATION_PATTERN.exec(marker.trim());
  if (!match) return [];
  const seen = new Set<number>();
  for (const part of match[1].split(/\s*,\s*/)) {
    const value = Number.parseInt(part, 10);
    if (!Number.isFinite(value)) continue;
    if (value < 1 || value > available) continue;
    seen.add(value);
  }
  return [...seen].sort((a, b) => a - b);
}
