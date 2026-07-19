'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const service = require('../../../../src/modules/agent/profile/agent-profile.service');
const repository = require('../../../../src/modules/agent/profile/agent-profile.repository');

test('agent profile service preserves defensive responses and mapping', async (t) => {
  await t.test('missing user ID and missing agent responses are exact', async () => {
    const original = repository.findProfileAgent;
    repository.findProfileAgent = async () => null;
    try {
      assert.deepEqual(await service.getProfile({}), {
        statusCode: 401,
        body: { success: false, message: 'Unauthorized.' },
      });
      assert.deepEqual(await service.getProfile({ userId: crypto.randomBytes(12).toString('hex') }), {
        statusCode: 404,
        body: { success: false, message: 'Agent profile not found.' },
      });
    } finally {
      repository.findProfileAgent = original;
    }
  });

  await t.test('non-approved agent response preserves dynamic status data', async () => {
    const original = repository.findProfileAgent;
    repository.findProfileAgent = async () => ({ applicationStatus: 'MORE_INFO' });
    try {
      const result = await service.getProfile({ userId: crypto.randomBytes(12).toString('hex') });
      assert.deepEqual(result, {
        statusCode: 403,
        body: {
          success: false,
          message: 'Your application is "MORE_INFO". Profile is available after approval.',
          data: { applicationStatus: 'MORE_INFO' },
        },
      });
    } finally {
      repository.findProfileAgent = original;
    }
  });

  await t.test('approved agent returns exact profile response', async () => {
    const original = repository.findProfileAgent;
    const linkedOperator = { brandName: 'Brand', logo: null, brandCode: 'OB-RUNTIME' };
    repository.findProfileAgent = async () => ({
      agentId: 'SHV-AG-RUNTIME',
      agentType: 'OPERATOR_LINKED',
      applicationStatus: 'APPROVED',
      linkedOperatorId: linkedOperator,
      businessName: 'Counter',
      shopAddress: 'Road',
      commissionRate: 8,
      commissionBalance: 20,
    });
    try {
      const result = await service.getProfile({ userId: crypto.randomBytes(12).toString('hex') });
      assert.equal(result.statusCode, 200);
      assert.equal(result.body.message, 'Agent profile retrieved.');
      assert.equal(result.body.data.linkedOperator, linkedOperator);
      assert.equal(Object.hasOwn(result.body.data, 'commissionRate'), true);
      assert.equal(Object.hasOwn(result.body.data, 'createdAt'), true);
    } finally {
      repository.findProfileAgent = original;
    }
  });
});
