'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const mapper = require('../../../../src/modules/agent/profile/agent-profile.mapper');

test('agent profile mapper preserves exact fields and null linked operator', () => {
  const approvedAt = new Date('2026-05-01T01:02:03.000Z');
  const result = mapper.toProfileResponse({
    agentId: 'SHV-AG-MAP',
    agentType: 'DEFAULT',
    applicationStatus: 'APPROVED',
    linkedOperatorId: null,
    businessName: 'Shop',
    shopAddress: 'Address',
    operationType: 'hotel',
    district: 'Kaski',
    municipality: 'Pokhara',
    commissionRate: 5,
    commissionBalance: 10,
    minSettlementThreshold: 500,
    totalOnlineBookings: 1,
    totalCashBookings: 2,
    totalCommissionEarned: 3,
    totalCommissionSettled: 4,
    lastBookingAt: approvedAt,
    settlementMethod: 'BANK',
    referralCode: 'REF-MAP',
    qrCodeUrl: 'qr',
    approvedAt,
    createdAt: approvedAt,
    ignored: 'not returned',
  });
  assert.deepEqual(Object.keys(result.data), [
    'agentId', 'agentType', 'applicationStatus', 'linkedOperator',
    'businessName', 'shopAddress', 'operationType', 'district', 'municipality',
    'commissionRate', 'commissionBalance', 'minSettlementThreshold',
    'totalOnlineBookings', 'totalCashBookings', 'totalCommissionEarned',
    'totalCommissionSettled', 'lastBookingAt', 'settlementMethod',
    'referralCode', 'qrCodeUrl', 'approvedAt', 'createdAt',
  ]);
  assert.equal(result.data.linkedOperator, null);
  assert.equal(result.message, 'Agent profile retrieved.');
});
