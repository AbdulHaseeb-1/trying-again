import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { RunCitations, referenceId } from '../src/agent/citations/citation.service';
import type { AgentReference } from '../src/agent/citations/reference.types';

const news = (id: string, title = `Story ${id}`): AgentReference => ({
  id: referenceId('news', id),
  type: 'news',
  title,
  source: 'MarketPulse Calendar',
  entityId: id,
  publishedAt: '2026-09-10T12:00:00.000Z',
});

/**
 * "A citation shown in the UI must map to an actual stored reference."
 *
 * That promise lives or dies here. These tests are written as the adversarial
 * cases a model actually produces: an index past the end, a marker in a list
 * where only some members exist, and a citation to a source that was never
 * returned by any tool.
 */
describe('run citations', () => {
  it('numbers references in the order they are produced', () => {
    const citations = new RunCitations();
    assert.equal(citations.add(news('a')).citationIndex, 1);
    assert.equal(citations.add(news('b')).citationIndex, 2);
    assert.equal(citations.add(news('c')).citationIndex, 3);
  });

  it('deduplicates by reference id, keeping the first index', () => {
    const citations = new RunCitations();
    citations.add(news('a'));
    citations.add(news('b'));
    // The same article returned again by a second tool is one source, not two.
    assert.equal(citations.add(news('a')).citationIndex, 1);
    assert.equal(citations.size, 2);
  });

  it('keeps citations that resolve', () => {
    const citations = new RunCitations();
    citations.add(news('a'));
    citations.add(news('b'));
    assert.equal(
      citations.sanitize('CPI printed at 2.9% [1], which surprised the desk [2].'),
      'CPI printed at 2.9% [1], which surprised the desk [2].',
    );
  });

  it('strips a fabricated citation', () => {
    const citations = new RunCitations();
    citations.add(news('a'));
    // The model invented [7]; nothing in the run produced a seventh source.
    const clean = citations.sanitize('Inflation is cooling [7].');
    assert.equal(clean.includes('[7]'), false);
    assert.equal(clean, 'Inflation is cooling.');
  });

  it('strips fabricated members out of a mixed marker', () => {
    const citations = new RunCitations();
    citations.add(news('a'));
    citations.add(news('b'));
    // [1] resolves and survives; [9] does not and is dropped from the marker.
    assert.equal(citations.sanitize('Both desks agree [1, 9].'), 'Both desks agree [1].');
    assert.equal(citations.sanitize('Both desks agree [1, 2].'), 'Both desks agree [1, 2].');
  });

  it('strips every marker when the run produced no sources at all', () => {
    const citations = new RunCitations();
    assert.equal(citations.sanitize('As reported [1][2].'), 'As reported.');
  });

  it('leaves ordinary bracketed text alone', () => {
    const citations = new RunCitations();
    citations.add(news('a'));
    // Only numeric markers are citations; prose in brackets is prose.
    assert.equal(
      citations.sanitize('The release [seasonally adjusted] came in hot [1].'),
      'The release [seasonally adjusted] came in hot [1].',
    );
  });

  it('reports only the references actually cited', () => {
    const citations = new RunCitations();
    citations.add(news('a'));
    citations.add(news('b'));
    citations.add(news('c'));
    const used = citations.used('Only the first and third matter [1] [3].');
    assert.deepEqual(
      used.map((reference) => reference.citationIndex),
      [1, 3],
    );
  });

  it('describes the available sources for the model with their indices', () => {
    const citations = new RunCitations();
    citations.add(news('a', 'US CPI y/y: 2.9%'));
    const described = citations.describeForModel();
    assert.match(described, /^\[1\] US CPI y\/y: 2\.9% — MarketPulse Calendar/);
    assert.match(described, /2026-09-10/);
  });

  it('derives a stable id from type and key', () => {
    assert.equal(referenceId('news', 'news_1'), referenceId('news', 'news_1'));
    assert.notEqual(referenceId('news', 'news_1'), referenceId('web', 'news_1'));
    assert.match(referenceId('web', 'https://example.com'), /^ref_/);
  });
});
