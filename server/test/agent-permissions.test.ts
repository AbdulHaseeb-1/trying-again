import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CAPABILITIES,
  CAPABILITY_LABELS,
  decide,
  isCapability,
  requiresApproval,
} from '../src/agent/permissions/permission';

/**
 * Authorization is the one thing in this feature that must not be decided by a
 * model, so it is decided by a pure function — and this is that function's
 * contract.
 */
describe('agent permissions', () => {
  it('allows a capability the agent holds', () => {
    const decision = decide('news.read', 'READ', ['news.read', 'app.read']);
    assert.equal(decision.allowed, true);
    assert.equal(decision.allowed && decision.needsApproval, false);
  });

  it('refuses a capability the agent does not hold, with a readable reason', () => {
    const decision = decide('chart.write', 'WRITE', ['chart.read']);
    assert.equal(decision.allowed, false);
    assert.equal(decision.allowed, false);
    if (!decision.allowed) {
      assert.match(decision.reason, /not permitted/i);
      // The message names the capability so a user can tell which one is missing.
      assert.match(decision.reason, /change the chart/i);
    }
  });

  it('refuses even when a neighbouring capability is held', () => {
    // The classic mistake: "chart.read" implying "chart.write" by prefix.
    assert.equal(decide('chart.write', 'WRITE', ['chart.read']).allowed, false);
    assert.equal(decide('web.fetch', 'EXTERNAL_NETWORK', ['web.search']).allowed, false);
  });

  it('requires approval only for CONFIRM_REQUIRED, whatever the capability', () => {
    assert.equal(requiresApproval('READ'), false);
    assert.equal(requiresApproval('WRITE'), false);
    assert.equal(requiresApproval('EXTERNAL_NETWORK'), false);
    assert.equal(requiresApproval('SENSITIVE'), false);
    assert.equal(requiresApproval('CONFIRM_REQUIRED'), true);

    const decision = decide('alerts.write', 'CONFIRM_REQUIRED', ['alerts.write']);
    assert.equal(decision.allowed && decision.needsApproval, true);
  });

  it('refuses everything for an agent granted nothing', () => {
    for (const capability of CAPABILITIES) {
      assert.equal(decide(capability, 'READ', []).allowed, false);
    }
  });

  it('recognises only known capability names', () => {
    assert.equal(isCapability('news.read'), true);
    assert.equal(isCapability('news.write'), false);
    assert.equal(isCapability(''), false);
  });

  it('labels every capability, so no permission can render as a bare id', () => {
    for (const capability of CAPABILITIES) {
      assert.equal(typeof CAPABILITY_LABELS[capability], 'string');
      assert.ok(CAPABILITY_LABELS[capability].length > 0);
    }
  });
});
