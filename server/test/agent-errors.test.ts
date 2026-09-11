import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  AgentError,
  codeForStatus,
  isFailoverWorthy,
  normalizeError,
} from '../src/agent/agent.errors';

/**
 * Error normalization decides two user-visible things: what the panel says, and
 * whether a fallback provider is tried. Both are easy to get subtly wrong —
 * "cancelled" must never look retryable, and a 401 must never trigger a
 * failover to a second provider that will also reject the same bad key.
 */
describe('error normalization', () => {
  it('maps HTTP statuses onto the vocabulary', () => {
    assert.equal(codeForStatus(401), 'auth_failed');
    assert.equal(codeForStatus(403), 'auth_failed');
    assert.equal(codeForStatus(404), 'model_unavailable');
    assert.equal(codeForStatus(408), 'timeout');
    assert.equal(codeForStatus(429), 'rate_limited');
    assert.equal(codeForStatus(500), 'provider_unavailable');
    assert.equal(codeForStatus(503), 'provider_unavailable');
    assert.equal(codeForStatus(422), 'bad_request');
  });

  it('classifies transport failures by their message', () => {
    assert.equal(normalizeError(new Error('fetch failed')).code, 'provider_unavailable');
    assert.equal(normalizeError(new Error('connect ECONNREFUSED')).code, 'provider_unavailable');
    assert.equal(normalizeError(new Error('Request timed out')).code, 'timeout');
    assert.equal(normalizeError(new Error('The operation was aborted')).code, 'cancelled');
    assert.equal(normalizeError(new Error('429 Too Many Requests')).code, 'rate_limited');
    assert.equal(normalizeError(new Error('guardrail tripwire triggered')).code, 'guardrail_blocked');
  });

  it('hides the detail unless debug mode asked for it', () => {
    const error = new Error('Bearer sk-live-abcdef rejected by upstream');
    assert.equal(normalizeError(error).detail, undefined);
    assert.match(String(normalizeError(error, true).detail), /rejected by upstream/);
  });

  it('gives every code a sentence a person can act on', () => {
    const normalized = normalizeError(new Error('fetch failed'));
    assert.match(normalized.message, /provider could not be reached/i);
    // The safe message never carries the original text.
    assert.equal(normalized.message.includes('fetch failed'), false);
  });

  it('carries an AgentError through unchanged', () => {
    const error = new AgentError('rate_limited', 'Slow down.', 'x-ratelimit-remaining: 0');
    const normalized = error.normalized(true);
    assert.equal(normalized.code, 'rate_limited');
    assert.equal(normalized.message, 'Slow down.');
    assert.equal(normalized.retryable, true);
    assert.equal(normalized.detail, 'x-ratelimit-remaining: 0');
  });

  it('never marks a cancelled run retryable', () => {
    assert.equal(normalizeError(new Error('AbortError')).retryable, false);
    assert.equal(new AgentError('cancelled').normalized().retryable, false);
  });

  it('fails over only where another provider could plausibly succeed', () => {
    const codes = ['provider_unavailable', 'timeout', 'rate_limited', 'model_unavailable'] as const;
    for (const code of codes) {
      assert.equal(isFailoverWorthy(new AgentError(code).normalized()), true, code);
    }
    // A bad key, a blocked prompt or a cancelled run will fail identically on
    // the fallback, so switching would only waste the user's time.
    for (const code of ['auth_failed', 'guardrail_blocked', 'cancelled', 'bad_request'] as const) {
      assert.equal(isFailoverWorthy(new AgentError(code).normalized()), false, code);
    }
  });
});

describe('error normalization: a provider that answered', () => {
  it('reads the status off the error the SDK threw', () => {
    // What an OpenAI-style client throws: a status on the error object, and a
    // message that says nothing a keyword search would catch.
    const thrown = Object.assign(new Error('500 Internal Server Error'), { status: 503 });
    const normalized = normalizeError(thrown);
    assert.equal(normalized.code, 'provider_unavailable');
    assert.equal(normalized.retryable, true);
    // And a 5xx is worth trying on another provider, which "internal" is not.
    assert.equal(isFailoverWorthy(normalized), true);
  });

  it('finds a status carried further down the cause chain', () => {
    const inner = Object.assign(new Error('Too Many Requests'), { statusCode: 429 });
    const outer = new Error('model call failed', { cause: inner });
    assert.equal(normalizeError(outer).code, 'rate_limited');
  });

  it('ignores a status that is not an HTTP failure', () => {
    const thrown = Object.assign(new Error('socket hang up'), { status: 0 });
    assert.equal(normalizeError(thrown).code, 'provider_unavailable');
  });
});
