import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { citationIndices } from '@/agent/ui/citation-markers';

/**
 * The renderer must not be able to invent a source either.
 *
 * The server sanitises the text before it is stored, so these cases only arise
 * from an older stored message or a bug upstream — which is exactly why the
 * component checks again rather than trusting its input.
 */
describe('citation markers', () => {
  it('renders an index the message actually has', () => {
    assert.deepEqual(citationIndices('[1]', 3), [1]);
    assert.deepEqual(citationIndices('[3]', 3), [3]);
  });

  it('renders nothing for an index past the end', () => {
    assert.deepEqual(citationIndices('[4]', 3), []);
    assert.deepEqual(citationIndices('[1]', 0), []);
  });

  it('drops only the invented members of a list', () => {
    assert.deepEqual(citationIndices('[1, 9]', 2), [1]);
    assert.deepEqual(citationIndices('[2, 1]', 2), [1, 2]);
  });

  it('deduplicates a repeated index', () => {
    assert.deepEqual(citationIndices('[1, 1]', 2), [1]);
  });

  it('ignores zero and negative indices', () => {
    assert.deepEqual(citationIndices('[0]', 3), []);
  });

  it('is not fooled by text that merely contains brackets', () => {
    assert.deepEqual(citationIndices('[seasonally adjusted]', 3), []);
    assert.deepEqual(citationIndices('[1a]', 3), []);
    assert.deepEqual(citationIndices('not a marker', 3), []);
  });

  it('tolerates surrounding whitespace', () => {
    assert.deepEqual(citationIndices('  [2]  ', 3), [2]);
  });
});
