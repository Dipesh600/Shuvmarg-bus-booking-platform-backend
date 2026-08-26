'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// Must be the first require: the helper patches the SMS handler into the require
// cache before it loads the service under test.
const {
  OWNER_ID, harness, rejects, service, smsCalls, validBody,
} = require('../../helpers/agent-invite-harness');

test('operator agent create — refusals', async (t) => {
  await t.test('a phone that is already an agent is refused with 409', async () => {
    const h = harness({
      checkPhoneForRole: async () => ({ exists: true, hasRole: true, user: { _id: 'user-1' } }),
      findAgentByUserId: async () => ({ _id: 'agent-1', code: 'SM-AG-EXISTING' }),
    });
    try {
      await rejects(service.createAgent(OWNER_ID, validBody), 409);
      assert.equal(h.calls.createAgent.length, 0);
      assert.equal(h.calls.createUser.length, 0);
      assert.equal(smsCalls.length, 0);
    } finally { h.restore(); }
  });

  await t.test('the 409 does not disclose the existing agent code or account', async () => {
    const h = harness({
      checkPhoneForRole: async () => ({ exists: true, hasRole: true, user: { _id: 'user-1' } }),
      findAgentByUserId: async () => ({ _id: 'agent-1', code: 'SM-AG-EXISTING' }),
    });
    try {
      await assert.rejects(service.createAgent(OWNER_ID, validBody), (error) => {
        const body = JSON.stringify(error.responseBody);
        assert.doesNotMatch(body, /SM-AG-EXISTING/);
        assert.doesNotMatch(body, /agent-1|user-1/);
        return true;
      });
    } finally { h.restore(); }
  });

  await t.test('a brandId the owner does not own is refused with 403', async () => {
    const h = harness({ brand: null });
    try {
      await rejects(
        service.createAgent(OWNER_ID, { ...validBody, brandId: '507f1f77bcf86cd799439030' }),
        403,
      );
      // Refused before anything was written.
      assert.equal(h.calls.createUser.length, 0);
      assert.equal(h.calls.createAgent.length, 0);
    } finally { h.restore(); }
  });

  await t.test('ownership is checked against the calling owner, in one query', async () => {
    const h = harness({ brand: { _id: 'brand-1', name: 'Kaski Yatayat' } });
    try {
      await service.createAgent(OWNER_ID, { ...validBody, brandId: 'brand-1' });
      assert.deepEqual(h.calls.findOwnedBrand[0], [OWNER_ID, 'brand-1']);
    } finally { h.restore(); }
  });

  await t.test('no brandId means no brand query and no brand in the response', async () => {
    const h = harness();
    try {
      const result = await service.createAgent(OWNER_ID, validBody);
      assert.equal(h.calls.findOwnedBrand.length, 0);
      assert.equal(result.responseBody.data.brand, null);
    } finally { h.restore(); }
  });

  await t.test('a non-Nepal mobile is refused before any DB write', async () => {
    const h = harness();
    try {
      await rejects(service.createAgent(OWNER_ID, { ...validBody, phone: '0145678901' }), 400);
      assert.equal(h.calls.createUser.length, 0);
      assert.equal(h.calls.createAgent.length, 0);
    } finally { h.restore(); }
  });

  await t.test('a missing name is refused with the field errors listed', async () => {
    const h = harness();
    try {
      await assert.rejects(service.createAgent(OWNER_ID, { phone: '9800000000' }), (error) => {
        assert.equal(error.statusCode, 400);
        assert.deepEqual(error.responseBody.errors, ['name is required.']);
        return true;
      });
    } finally { h.restore(); }
  });

  await t.test('a duplicate key from the unique index becomes a 409, not a 500', async () => {
    const duplicate = Object.assign(new Error('E11000'), {
      code: 11000,
      keyPattern: { user: 1 },
    });
    const h = harness({ createAgent: async () => { throw duplicate; } });
    try {
      await rejects(service.createAgent(OWNER_ID, validBody), 409);
    } finally { h.restore(); }
  });
});
