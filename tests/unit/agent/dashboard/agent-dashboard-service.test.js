'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const service = require('../../../../src/modules/agent/dashboard/agent-dashboard.service');
const repository = require('../../../../src/modules/agent/dashboard/agent-dashboard.repository');

test('agent dashboard service', async (t) => {
  await t.test('missing user ID preserves internal unauthorized response', async () => {
    const result = await service.getDashboard({});
    assert.deepEqual(result, {
      statusCode: 401,
      body: { success: false, message: 'Unauthorized.' },
    });
  });

  await t.test('missing and uncleared agents preserve defensive 403 response', async () => {
    const original = repository.findDashboardAgent;
    const seen = [];
    repository.findDashboardAgent = async (id) => {
      seen.push(id);
      return seen.length === 1 ? null : { applicationStatus: 'PENDING' };
    };
    try {
      const missing = await service.getDashboard({ userId: 'u1' });
      const pending = await service.getDashboard({ userId: 'u2' });
      const body = {
        success: false,
        message: 'Dashboard available once your verification is complete.',
      };
      assert.deepEqual(missing, { statusCode: 403, body });
      assert.deepEqual(pending, { statusCode: 403, body });
      assert.deepEqual(seen, ['u1', 'u2']);
    } finally {
      repository.findDashboardAgent = original;
    }
  });

  await t.test('an operator agent at VERIFIED_BASIC is not refused here', async () => {
    // The handler's defensive check used to be a second copy of
    // `applicationStatus === "APPROVED"`, so fixing only the route gate would have
    // let these agents through the door and refused them at the desk.
    const original = repository.findDashboardAgent;
    repository.findDashboardAgent = async () => ({
      scope: 'OPERATOR', applicationStatus: 'VERIFIED_BASIC', agentType: 'OPERATOR_LINKED',
    });
    try {
      const result = await service.getDashboard({ userId: 'u1' });
      assert.equal(result.statusCode, 200);
    } finally {
      repository.findDashboardAgent = original;
    }
  });

  await t.test('approved agent maps exact dashboard response', async () => {
    const original = repository.findDashboardAgent;
    const agent = {
      applicationStatus: 'APPROVED',
      commissionBalance: 1,
      totalOnlineBookings: 2,
      totalCashBookings: 3,
      totalCommissionEarned: 4,
      totalCommissionSettled: 5,
      lastBookingAt: null,
      commissionRate: 6,
      agentType: 'DEFAULT',
    };
    repository.findDashboardAgent = async () => agent;
    try {
      const result = await service.getDashboard({ userId: 'u1' });
      assert.equal(result.statusCode, 200);
      assert.deepEqual(Object.keys(result.body.data), [
        'commissionBalance',
        'totalOnlineBookings',
        'totalCashBookings',
        'totalCommissionEarned',
        'totalCommissionSettled',
        'lastBookingAt',
        'commissionRate',
        'agentType',
      ]);
    } finally {
      repository.findDashboardAgent = original;
    }
  });
});
