'use strict';

/**
 * The OPERATOR KYC transitions as they happen on a profile update.
 *
 * Deriving only on read would work, but one request late: updateIdentity loads the
 * agent before the patch exists, so an agent supplying their last outlet detail
 * would be told PHONE_VERIFIED and have to reload to see VERIFIED_BASIC. These
 * cases pin the advance to the same write as the patch.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { harness, service } = require('../../helpers/agent-identity-service-harness');

/** Applies one patch and reports what the service did and returned. */
const update = async (body, setup) => {
  const context = harness(setup);
  try {
    const { responseBody } = await service.updateIdentity('user-1', body);
    return { agent: context.agent, calls: context.calls, data: responseBody.data };
  } finally { context.restore(); }
};

test('deriving the operator KYC status on update', async (t) => {
  await t.test('the last outlet detail advances the status in the same write', async () => {
    const { agent, calls, data } = await update(
      { district: 'Kaski' },
      { agent: { applicationStatus: 'PHONE_VERIFIED', district: null } },
    );
    assert.equal(agent.district, 'Kaski');
    assert.equal(agent.applicationStatus, 'VERIFIED_BASIC');
    // One write, not a patch write followed by a status write on the next read.
    assert.equal(calls.saves, 1);
    assert.equal(data.kycStatus, 'VERIFIED_BASIC');
    assert.equal(data.kycCleared, true);
  });

  await t.test('clearing an outlet detail demotes in the same response', async () => {
    // The response must not report a status the record no longer supports.
    const { agent, calls, data } = await update({ district: null });
    assert.equal(agent.applicationStatus, 'PHONE_VERIFIED');
    assert.equal(calls.saves, 1);
    assert.equal(data.kycStatus, 'PHONE_VERIFIED');
    assert.equal(data.kycCleared, false);
  });

  await t.test('a patch that does not move the status still writes once', async () => {
    const { agent, calls } = await update({ placeName: 'Newroad' });
    assert.equal(agent.placeName, 'Newroad');
    assert.equal(agent.applicationStatus, 'VERIFIED_BASIC');
    assert.equal(calls.saves, 1);
  });

  await t.test('an empty patch writes nothing', async () => {
    const { calls } = await update({});
    assert.equal(calls.saves, 0);
    assert.deepEqual(calls.names, []);
  });

  await t.test('a name-only patch updates the user and leaves the agent alone', async () => {
    const { calls, data } = await update({ name: 'Shyam Prasad' });
    assert.deepEqual(calls.names, ['Shyam Prasad']);
    assert.equal(calls.saves, 0);
    assert.equal(data.name, 'Shyam Prasad');
  });

  await t.test('a patch cannot move the status of a PLATFORM agent', async () => {
    // Outlet details are an OPERATOR concept. A platform agent filling them in is
    // still waiting on a reviewer.
    const { agent, data } = await update(
      { district: 'Kaski' },
      { agent: { scope: 'PLATFORM', applicationStatus: 'PENDING' } },
    );
    assert.equal(agent.applicationStatus, 'PENDING');
    assert.equal(data.kycCleared, false);
  });

  await t.test('a patch cannot lift a SUSPENDED agent', async () => {
    const { agent, data } = await update(
      { district: 'Kaski' },
      { agent: { applicationStatus: 'SUSPENDED' } },
    );
    assert.equal(agent.applicationStatus, 'SUSPENDED');
    assert.equal(data.kycCleared, false);
  });

  await t.test('an invalid patch is refused before anything is written', async () => {
    const context = harness();
    try {
      await assert.rejects(
        () => service.updateIdentity('user-1', { outletType: 'SPACE_STATION' }),
        (error) => error.statusCode === 400,
      );
      assert.equal(context.calls.saves, 0);
    } finally { context.restore(); }
  });
});
