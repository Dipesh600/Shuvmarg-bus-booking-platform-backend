'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const mapper = require('../../../../src/modules/agent/admin/directory/agent-directory.mapper');

test('agent directory mapper preserves detail and list response shapes', async (t) => {
  await t.test('details embeds selected user while preserving profile object', () => {
    const user = { _id: 'u1', name: 'Agent One', phone: '9800000000', email: 'a@example.test' };
    const agent = { toObject: () => ({ _id: 'a1', agentId: 'SHV-AG-1', documents: [{ fileKey: 'old' }] }) };
    assert.deepEqual(mapper.detailsResponse(agent, user, [{ fileKey: 'new' }]), {
      success: true,
      message: 'Agent details retrieved successfully!',
      data: {
        profile: user,
        agentDetails: {
          _id: 'a1',
          agentId: 'SHV-AG-1',
          documents: [{ fileKey: 'new' }],
          user,
        },
      },
    });
  });

  await t.test('list item preserves fallbacks and legacy formatting', () => {
    const body = mapper.listResponse([{
      _id: 'a1', agentId: 'SHV-AG-1', user: null, applicationStatus: 'PENDING',
      agentType: 'DEFAULT', linkedOperatorId: null, municipality: null, district: null,
      commissionRate: 5, commissionBalance: 0, totalOnlineBookings: 2, totalCashBookings: 4,
      operationType: 'hotel', submittedAt: 'submitted', createdAt: 'created',
    }]);
    assert.equal(body.message, 'Agents retrieved successfully!');
    assert.equal(body.results, 1);
    assert.deepEqual(body.data[0], {
      id: 'a1', agentId: 'SHV-AG-1', userId: undefined, name: 'N/A',
      phone: 'N/A', email: null, profileImg: null, applicationStatus: 'PENDING',
      agentType: 'DEFAULT', linkedOperator: null, location: 'N/A', commission: '5%',
      commissionBalance: 0, totalBookings: 6, operationType: 'hotel',
      submittedAt: 'submitted', createdAt: 'created',
    });
  });
});
