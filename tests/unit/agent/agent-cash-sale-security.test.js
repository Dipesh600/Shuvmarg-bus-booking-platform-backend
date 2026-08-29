'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('../../helpers/agent-seat-sale-harness');

test('V10 malformed sale costs zero database calls', async () => {
  const x = h.build();
  await assert.rejects(() => x.service.commitSale(h.USER_ID, { holdId: 'bad' }), (e) => e.statusCode === 400);
  assert.deepEqual(x.calls, []);
});

test('V1 actor and hold ownership come only from token user', async () => {
  const x = h.build();
  await x.service.commitSale(h.USER_ID, h.validBody({ agentId: 'attacker', userId: 'attacker' }));
  assert.deepEqual(x.calls[0], ['agent', h.USER_ID]);
  assert.equal(x.calls[1][0], 'claim');
  assert.equal(x.calls[1][2], h.USER_ID);
  assert.equal(x.calls.find(([name]) => name === 'agentBooking')[1].agentId, h.AGENT_ID);
});

test('V3 a user-scoped atomic miss returns the narrow 404 body', async () => {
  const x = h.build();
  x.deps.repository.claimOwnedAgentHold = async () => null;
  x.deps.repository.findOwnedHoldState = async () => null;
  const service = require('../../../src/modules/agent/cash-sale/agent-cash-sale.service').createAgentCashSaleService(x.deps);
  await assert.rejects(() => service.commitSale(h.USER_ID, h.validBody()), (e) => {
    assert.equal(e.statusCode, 404);
    assert.deepEqual(e.responseBody, { success: false, message: 'Sale hold not found.', errorCode: 'SALE_HOLD_NOT_FOUND' });
    return true;
  });
});

test('V7 commit re-derives brand from hold Trip before locking seats', async () => {
  const x = h.build();
  x.deps.repository.findTripContext = async () => ({ ...x.trip, brandId: 'changed-brand' });
  const service = require('../../../src/modules/agent/cash-sale/agent-cash-sale.service').createAgentCashSaleService(x.deps);
  await assert.rejects(() => service.commitSale(h.USER_ID, h.validBody({ brandId: 'changed-brand' })), (e) => e.responseBody.errorCode === 'SALE_SCOPE_CHANGED');
  assert.equal(x.calls.some(([name]) => name === 'lock'), false);
  assert.equal(x.calls.some(([name]) => name === 'restore'), true);
});

test('V3 concurrent double commit yields one success and one conflict', async () => {
  const x = h.build();
  let claimed = false;
  x.deps.repository.claimOwnedAgentHold = async () => claimed ? null : (claimed = true, x.hold);
  x.deps.repository.findOwnedHoldState = async () => ({ status: 'processing' });
  const service = require('../../../src/modules/agent/cash-sale/agent-cash-sale.service').createAgentCashSaleService(x.deps);
  const results = await Promise.allSettled([service.commitSale(h.USER_ID, h.validBody()), service.commitSale(h.USER_ID, h.validBody())]);
  assert.deepEqual(results.map((r) => r.status).sort(), ['fulfilled', 'rejected']);
  assert.equal(results.find((r) => r.status === 'rejected').reason.statusCode, 409);
});
