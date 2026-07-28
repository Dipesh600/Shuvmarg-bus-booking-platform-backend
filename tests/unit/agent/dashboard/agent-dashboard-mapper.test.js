'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const mapper = require('../../../../src/modules/agent/dashboard/agent-dashboard.mapper');

test('agent dashboard mapper preserves exact response fields and values', () => {
  const lastBookingAt = new Date('2026-02-03T04:05:06.000Z');
  const result = mapper.toDashboardResponse({
    commissionBalance: 10,
    totalOnlineBookings: 20,
    totalCashBookings: 30,
    totalCommissionEarned: 40,
    totalCommissionSettled: 50,
    lastBookingAt,
    commissionRate: 7,
    agentType: 'OPERATOR_LINKED',
    ignored: 'not returned',
  });
  assert.deepEqual(result, {
    success: true,
    data: {
      commissionBalance: 10,
      totalOnlineBookings: 20,
      totalCashBookings: 30,
      totalCommissionEarned: 40,
      totalCommissionSettled: 50,
      lastBookingAt,
      commissionRate: 7,
      agentType: 'OPERATOR_LINKED',
    },
  });
});
