'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const mapper = require('../../../src/modules/bus-owner/agent-assign/bus-owner-agent-assign.mapper');
const { BRAND_ID, ownedBrand, savedAssignment, storedAgent } = require('../../helpers/agent-assign-harness');

const built = (over = {}) => mapper.toCreatedResponse({
  assignment: savedAssignment(),
  agent: storedAgent(),
  brand: ownedBrand(),
  kycStatus: 'VERIFIED',
  isVerified: true,
  ...over,
});

test('assign response shape', async (t) => {
  await t.test('reports the assignment as INVITED and says acceptance is needed', () => {
    const { data, message } = built();
    assert.equal(data.status, 'INVITED');
    assert.equal(data.requiresAgentAcceptance, true);
    assert.match(message, /accept/i);
  });

  await t.test('carries the invite window so the client can show a deadline', () => {
    const { data } = built();
    assert.equal(data.invitedAt.toISOString(), '2026-08-27T10:00:00.000Z');
    assert.equal(data.expiresAt.toISOString(), '2026-09-03T10:00:00.000Z');
  });

  await t.test('names the brand by its brandName', () => {
    assert.deepEqual(built().data.brand, { id: BRAND_ID, name: 'Kaski Yatayat' });
    assert.equal(built({ brand: { _id: BRAND_ID } }).data.brand.name, null);
  });

  await t.test('returns the agent preview and nothing more', () => {
    const { agent } = built().data;
    assert.deepEqual(Object.keys(agent).sort(), [
      'agentCode', 'businessName', 'isVerified', 'kycStatus', 'name', 'outletType',
    ]);
    assert.equal(agent.agentCode, 'SM-AG-MAVSKNF');
    assert.equal(agent.name, 'Ram Bahadur');
  });

  await t.test('never returns the agent phone, email or internal id', () => {
    // An operator who has just invited someone has not thereby earned their
    // contact details. Acceptance is a different endpoint's decision.
    const serialised = JSON.stringify(built());
    for (const forbidden of ['phone', 'email', 'citizenship', 'pan', 'bank']) {
      assert.ok(!serialised.toLowerCase().includes(forbidden), `${forbidden} must not appear`);
    }
    assert.equal(built().data.agent.agentId, undefined);
  });

  await t.test('prefers the canonical code over the legacy id', () => {
    const legacy = storedAgent({ code: null, agentId: 'SHV-AG-KTM-001' });
    assert.equal(built({ agent: legacy }).data.agent.agentCode, 'SHV-AG-KTM-001');
  });

  await t.test('reads the terms back off the saved row, not off the request', () => {
    // The request may have omitted both, in which case the schema defaults are
    // what is now stored — and echoing the request would report the opposite.
    const { data } = built();
    assert.equal(data.access.accessScope, 'ALL_BUSES');
    assert.deepEqual(data.permissions, {
      canSellCash: true,
      canSellOnline: true,
      canCancel: false,
      cancelWindowMins: 0,
      maxSeatsPerBooking: null,
      maxDiscountPct: 0,
    });
    assert.deepEqual(data.commission, { mode: 'PERCENT', value: 0 });
  });

  await t.test('stringifies the narrowing lists so ids do not go out as objects', () => {
    const assignment = savedAssignment({
      accessScope: 'ROUTES',
      allowedRouteIds: [{ toString: () => 'aaaaaaaaaaaaaaaaaaaaaaaa' }],
    });
    const { data } = built({ assignment });
    assert.deepEqual(data.access.allowedRouteIds, ['aaaaaaaaaaaaaaaaaaaaaaaa']);
  });

  await t.test('survives an assignment whose subdocuments are missing', () => {
    const bare = { _id: 'a1', status: 'INVITED', accessScope: 'ALL_BUSES' };
    const { data } = built({ assignment: bare });
    assert.deepEqual(data.access.allowedRouteIds, []);
    assert.equal(data.permissions.maxSeatsPerBooking, null);
    assert.equal(data.commission.mode, undefined);
  });
});
