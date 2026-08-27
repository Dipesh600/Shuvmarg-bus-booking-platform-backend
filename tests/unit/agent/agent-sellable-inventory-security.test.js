'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const controller = require('../../../src/modules/agent/sellable-inventory/agent-sellable-inventory.controller');
const {
  USER_ID, assignment, availability, fareRule, harness, rejects, trip, service,
} = require('../../helpers/agent-sellable-inventory-harness');

test('agent sellable Trip inventory security and errors', async (t) => {
  await t.test('W5 no Agent for the token is NO_APPLICATION with no inventory query', async () => {
    const h = harness({ findAgentForUser: null });
    try {
      await rejects(service.listSellableInventory(USER_ID, {}), 403, 'NO_APPLICATION');
      assert.equal(h.calls.findSellableAssignments.length, 0);
      assert.equal(h.calls.findTripsForAssignment.length, 0);
    } finally { h.restore(); }
  });

  await t.test('W5 acting agent lookup receives only the token user id', async () => {
    const h = harness();
    try {
      await service.listSellableInventory(USER_ID, {
        agentId: 'attacker', assignmentId: 'attacker', brandId: 'attacker', ownerId: 'attacker',
      });
      assert.deepEqual(h.calls.findAgentForUser[0], [USER_ID]);
    } finally { h.restore(); }
  });

  await t.test('W7 malformed page or limit costs zero repository queries', async () => {
    for (const query of [{ page: [] }, { limit: {} }, { page: '1001' }, { limit: 'zero' }]) {
      const h = harness();
      try {
        await rejects(service.listSellableInventory(USER_ID, query), 400);
        for (const calls of Object.values(h.calls)) assert.equal(calls.length, 0);
      } finally { h.restore(); }
    }
  });

  await t.test('W7 page depth and size are bounded at accepted edges', async () => {
    const h = harness();
    try {
      await service.listSellableInventory(USER_ID, { page: '1000', limit: '999' });
      const pagination = h.calls.findTripsForAssignment[0][1];
      assert.equal(pagination.page, 1000);
      assert.equal(pagination.limit, 50);
      assert.ok(pagination.now instanceof Date);
    } finally { h.restore(); }
  });

  await t.test('W6 response exposes Trip facts but excludes PII and busschedules ids', async () => {
    const h = harness({
      findSellableAssignments: () => [assignment(undefined, {
        ownerId: 'owner-secret', invitedBy: 'inviter-secret', revokedBy: 'revoker-secret',
        operatorId: { ...assignment().operatorId, phone: '9800000000', email: 'brand@example.com' },
      })],
      findTripsForAssignment: () => [trip(undefined, {
        ownerId: 'owner-secret', busschedulesId: 'legacy-busschedules-secret',
        busId: { ...trip().busId, phone: '9811111111', email: 'bus@example.com' },
      })],
      findFareRulesForTrips: () => [{ ...fareRule(), ownerId: 'owner-secret', bank: 'BANK-SECRET' }],
      findAvailabilityForTrips: () => ({
        ...availability(), userId: 'other-agent-secret',
      }),
    });
    try {
      const body = (await service.listSellableInventory(USER_ID, {})).responseBody;
      assert.ok(body.data.inventory[0].trips[0].tripId);
      const serialised = JSON.stringify(body).toLowerCase();
      for (const forbidden of [
        'ownerid', 'owner-secret', 'invitedby', 'revokedby', '9800000000', '9811111111',
        'brand@example.com', 'bus@example.com', 'bank-secret', 'other-agent-secret',
        'legacy-busschedules-secret', 'busschedulesid', '"phone":', '"email":',
      ]) assert.ok(!serialised.includes(forbidden), `${forbidden} must not appear`);
    } finally { h.restore(); }
  });

  await t.test('W8 maps ValidationError and 11000 only', async () => {
    const validation = Object.assign(new Error('invalid'), {
      name: 'ValidationError', errors: { page: { message: 'invalid page' } },
    });
    for (const [failure, status] of [
      [validation, 400], [Object.assign(new Error('dup'), { code: 11000 }), 409],
    ]) {
      const h = harness({ findAgentForUser: () => { throw failure; } });
      try { await rejects(service.listSellableInventory(USER_ID, {}), status); } finally { h.restore(); }
    }
  });

  await t.test('W8 unknown error reaches the 500 pipeline unchanged', async () => {
    const failure = new Error('database unavailable');
    const original = service.listSellableInventory;
    service.listSellableInventory = async () => { throw failure; };
    const res = { status() { return this; }, json() { return this; } };
    try {
      let forwarded;
      await controller.listSellableInventory(
        { userInfo: { id: USER_ID }, query: {} }, res, (error) => { forwarded = error; },
      );
      assert.equal(forwarded, failure);
    } finally { service.listSellableInventory = original; }
  });
});
