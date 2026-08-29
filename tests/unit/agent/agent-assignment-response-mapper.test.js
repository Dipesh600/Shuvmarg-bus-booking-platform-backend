'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mapper = require('../../../src/modules/agent/assignment-response/agent-assignment-response.mapper');
const { assignment, BRAND_ID } = require('../../helpers/agent-assignment-response-harness');

test('assignment response mapper', async (t) => {
  await t.test('accept returns brandName and the complete terms allowlist', () => {
    const { data } = mapper.toResponse(assignment({ statusReason: 'operator-only' }), 'accept');
    assert.deepEqual(data.brand, { id: BRAND_ID, name: 'Kaski Yatayat' });
    assert.equal(data.accessScope, 'ALL_BUSES');
    assert.deepEqual(data.allowedRouteIds, []);
    assert.deepEqual(data.allowedScheduleIds, []);
    assert.deepEqual(data.permissions, {
      canSellCash: true,
      canSellOnline: true,
      canCancel: false,
      cancelWindowMins: 0,
      maxSeatsPerBooking: null,
      maxDiscountPct: 0,
    });
    assert.deepEqual(data.commission, { mode: 'PERCENT', value: 5 });
    assert.equal(Object.hasOwn(data, 'statusReason'), false);
  });

  await t.test('decline keeps the agent-authored statusReason', () => {
    const { data } = mapper.toResponse(assignment({ statusReason: 'Not now' }), 'decline');
    assert.equal(data.statusReason, 'Not now');
  });

  await t.test('S9 PII and internal provenance are absent', () => {
    const row = assignment({
      ownerId: 'owner-secret', invitedBy: 'inviter-secret', revokedBy: 'revoker-secret',
      operatorId: {
        _id: BRAND_ID, brandName: 'Kaski Yatayat', phone: '9800000000', email: 'private@example.com',
      },
    });
    const serialised = JSON.stringify(mapper.toResponse(row, 'accept')).toLowerCase();
    for (const forbidden of [
      'ownerid', 'invitedby', 'revokedby', '9800000000', 'private@example.com', 'phone', 'email',
    ]) assert.ok(!serialised.includes(forbidden), `${forbidden} must not appear`);
  });
});
