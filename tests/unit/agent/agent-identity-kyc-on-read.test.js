'use strict';

/**
 * The OPERATOR KYC transitions, as they happen on read.
 *
 * VERIFIED_BASIC was unreachable before this: nothing in the codebase ever wrote
 * PHONE_VERIFIED or VERIFIED_BASIC, so every operator-scope agent sat at DRAFT
 * forever. These cases are the machine actually having transitions.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { harness, service } = require('../../helpers/agent-identity-service-harness');

/** Loads the identity once and reports what the service did and returned. */
const load = async (setup) => {
  const context = harness(setup);
  try {
    const { responseBody } = await service.getIdentity('user-1');
    return { agent: context.agent, calls: context.calls, data: responseBody.data };
  } finally { context.restore(); }
};

test('deriving the operator KYC status on read', async (t) => {
  await t.test('a proven phone plus outlet details on file reaches VERIFIED_BASIC', async () => {
    const { agent, calls, data } = await load({ agent: { applicationStatus: 'DRAFT' } });
    assert.equal(agent.applicationStatus, 'VERIFIED_BASIC');
    assert.equal(calls.saves, 1);
    // The response reports the advanced status, so the agent sees it on the read
    // that caused it rather than on the next one.
    assert.equal(data.kycStatus, 'VERIFIED_BASIC');
    assert.equal(data.kycCleared, true);
  });

  await t.test('a proven phone with outlet details missing stops at PHONE_VERIFIED', async () => {
    const { agent, data } = await load({
      agent: { applicationStatus: 'DRAFT', district: null },
    });
    assert.equal(agent.applicationStatus, 'PHONE_VERIFIED');
    assert.equal(data.kycCleared, false);
  });

  await t.test('an unproven phone is DRAFT and writes nothing when already there', async () => {
    const { agent, calls } = await load({
      agent: { applicationStatus: 'DRAFT' },
      user: { phoneVerified: false },
    });
    assert.equal(agent.applicationStatus, 'DRAFT');
    assert.equal(calls.saves, 0);
  });

  await t.test('the status follows the facts in both directions', async () => {
    // Not a ratchet. An explicit `phoneVerified: false` under a stored
    // VERIFIED_BASIC means the user record says the phone is not proven, and the
    // status has to say the same thing — an agent selling on a status the facts
    // no longer support is worse than one who has to verify again.
    const { agent, calls } = await load({ user: { phoneVerified: false } });
    assert.equal(agent.applicationStatus, 'DRAFT');
    assert.equal(calls.saves, 1);
  });

  await t.test('a status already correct is not rewritten', async () => {
    // The fixture is a complete VERIFIED_BASIC agent, so derivation agrees with
    // what is stored. Idempotence matters: this runs on every profile read.
    const { calls } = await load();
    assert.equal(calls.saves, 0);
  });

  await t.test('a user projection missing phoneVerified strands, never demotes', async () => {
    // The footgun this guards: dropping `phoneVerified` from USER_IDENTITY_FIELDS
    // would make `undefined` read as "not verified" and knock every operator agent
    // back to DRAFT. A missing value is no opinion instead.
    const { agent, calls } = await load({ userDoc: { name: 'Ram Bahadur', phone: '9800000000' } });
    assert.equal(agent.applicationStatus, 'VERIFIED_BASIC');
    assert.equal(calls.saves, 0);
  });

  await t.test('a missing user document is no opinion', async () => {
    const { agent, calls } = await load({
      agent: { applicationStatus: 'DRAFT' },
      userDoc: null,
    });
    assert.equal(agent.applicationStatus, 'DRAFT');
    assert.equal(calls.saves, 0);
  });

  await t.test('SUSPENDED is an admin decision and is never revived', async () => {
    const { agent, calls } = await load({ agent: { applicationStatus: 'SUSPENDED' } });
    assert.equal(agent.applicationStatus, 'SUSPENDED');
    assert.equal(calls.saves, 0);
  });

  await t.test('a legacy OPERATOR_LINKED agent at APPROVED is never demoted', async () => {
    // These rows are written by the admin setup wizard and sell today. Derivation
    // that touched APPROVED would 403 every one of them.
    const { agent, calls, data } = await load({
      agent: { scope: undefined, agentType: 'OPERATOR_LINKED', applicationStatus: 'APPROVED' },
    });
    assert.equal(agent.applicationStatus, 'APPROVED');
    assert.equal(calls.saves, 0);
    assert.equal(data.kycCleared, true);
  });

  await t.test('a PLATFORM agent under review is left to the reviewer', async () => {
    const { agent, calls } = await load({
      agent: { scope: 'PLATFORM', applicationStatus: 'PENDING' },
    });
    assert.equal(agent.applicationStatus, 'PENDING');
    assert.equal(calls.saves, 0);
  });
});
