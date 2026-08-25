'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const mapper = require('../../../src/modules/agent/identity/agent-identity.mapper');

const agent = (overrides = {}) => ({
  code: 'SM-AG-7K4QP2X',
  agentId: 'SHV-AG-KTM-001',
  scope: 'OPERATOR',
  outletType: 'TICKET_COUNTER',
  applicationStatus: 'VERIFIED_BASIC',
  district: 'Kaski',
  municipality: 'Pokhara',
  placeName: 'Lakeside',
  businessName: 'Lake View Travels',
  shopAddress: 'Baidam Road 12',
  createdByOwnerId: '507f1f77bcf86cd799439011',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
});

const user = (overrides = {}) => ({
  name: 'Ram Bahadur',
  phone: '9800000000',
  profilePicture: 'https://cdn.example/x.jpg',
  ...overrides,
});

test('toIdentity wire shape', async (t) => {
  await t.test('exposes agentCode, never a bare "code"', () => {
    const data = mapper.toIdentity(agent(), user());
    assert.equal(data.agentCode, 'SM-AG-7K4QP2X');
    assert.equal(Object.hasOwn(data, 'code'), false);
  });

  await t.test('carries no privileged or financial field', () => {
    const data = mapper.toIdentity(
      agent({
        commissionRate: 12,
        commissionBalance: 5000,
        adminNotes: 'internal',
        citizenshipNumber: '12-34-56',
        panNumber: '123456789',
        bankAccountNumber: '0011002200',
        user: '507f1f77bcf86cd799439099',
        linkedOperatorId: '507f1f77bcf86cd799439012',
      }),
      user(),
    );
    for (const leaked of [
      'commissionRate', 'commissionBalance', 'adminNotes', 'citizenshipNumber',
      'panNumber', 'bankAccountNumber', 'user', 'linkedOperatorId', '_id',
    ]) {
      assert.equal(Object.hasOwn(data, leaked), false, `leaked: ${leaked}`);
    }
  });

  await t.test('a self-registered agent reads as not operator-created', () => {
    assert.equal(mapper.toIdentity(agent(), user()).createdByOperator, true);
    assert.equal(
      mapper.toIdentity(agent({ createdByOwnerId: null }), user()).createdByOperator,
      false,
    );
  });

  await t.test('missing user fields become null rather than undefined', () => {
    const data = mapper.toIdentity(agent(), null);
    assert.equal(data.name, null);
    assert.equal(data.phone, null);
    assert.equal(data.photoUrl, null);
  });

  await t.test('an agent with no code yet reports null, not a placeholder', () => {
    const data = mapper.toIdentity(agent({ code: null, agentId: null }), user());
    assert.equal(data.agentCode, null);
    assert.equal(data.legacyAgentId, null);
  });

  await t.test('the assignments block is present and zeroed for slice 1', () => {
    // The key exists to freeze the wire shape before AgentAssignment lands.
    assert.deepEqual(mapper.toIdentity(agent(), user()).assignments, {
      total: 0, active: 0, invited: 0,
    });
  });
});

test('KYC status presentation', async (t) => {
  await t.test('every status in the enum has a human label', () => {
    const { KYC_STATUSES } = require('../../../src/shared/identity/agent-enums');
    for (const status of Object.values(KYC_STATUSES)) {
      assert.equal(typeof mapper.KYC_LABELS.get(status), 'string', status);
      assert.notEqual(mapper.kycLabelFor(status), 'Status unavailable.', status);
    }
  });

  await t.test('an unknown status falls back rather than rendering undefined', () => {
    assert.equal(mapper.kycLabelFor('NONSENSE'), 'Status unavailable.');
    assert.equal(mapper.kycLabelFor(undefined), 'Status unavailable.');
    assert.equal(mapper.kycLabelFor('__proto__'), 'Status unavailable.');
  });

  await t.test('kycCleared follows the scope, not a hardcoded APPROVED', () => {
    const cleared = (scope, applicationStatus) => mapper
      .toIdentity(agent({ scope, applicationStatus }), user()).kycCleared;
    assert.equal(cleared('OPERATOR', 'VERIFIED_BASIC'), true);
    assert.equal(cleared('PLATFORM', 'APPROVED'), true);
    // Cross-scope values must not clear anyone.
    assert.equal(cleared('OPERATOR', 'APPROVED'), false);
    assert.equal(cleared('PLATFORM', 'VERIFIED_BASIC'), false);
    assert.equal(cleared('OPERATOR', 'DRAFT'), false);
    assert.equal(cleared('OPERATOR', 'SUSPENDED'), false);
  });
});

test('share payload', async (t) => {
  await t.test('prefers the current code', () => {
    assert.equal(mapper.sharePayloadFor(agent()), 'My Shuvmarg agent code is SM-AG-7K4QP2X');
  });

  await t.test('falls back to the legacy id so an old agent can still share', () => {
    assert.equal(
      mapper.sharePayloadFor(agent({ code: null })),
      'My Shuvmarg agent code is SHV-AG-KTM-001',
    );
  });

  await t.test('is null when there is nothing to share, never a broken sentence', () => {
    assert.equal(mapper.sharePayloadFor(agent({ code: null, agentId: null })), null);
  });
});

test('response envelopes', async (t) => {
  await t.test('all three carry success:true and a data block', () => {
    const envelopes = [
      mapper.toIdentityResponse(agent(), user()),
      mapper.toUpdatedIdentityResponse(agent(), user()),
      mapper.toCodeResponse(agent()),
    ];
    for (const envelope of envelopes) {
      assert.equal(envelope.success, true);
      assert.equal(typeof envelope.message, 'string');
      assert.equal(typeof envelope.data, 'object');
    }
  });

  await t.test('the code response is narrow — code, share text, status only', () => {
    const { data } = mapper.toCodeResponse(agent());
    assert.deepEqual(Object.keys(data).sort(), [
      'agentCode', 'kycStatus', 'legacyAgentId', 'scope', 'sharePayload',
    ]);
  });
});
