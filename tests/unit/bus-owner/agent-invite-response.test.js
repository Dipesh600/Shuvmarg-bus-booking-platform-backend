'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const mapper = require('../../../src/modules/bus-owner/agent-invite/bus-owner-agent-invite.mapper');

test('create response', async (t) => {
  const built = (overrides = {}) => mapper.toCreatedResponse({
    agent: {
      _id: '507f1f77bcf86cd799439020',
      code: 'SM-AG-7K4QP2X',
      agentId: 'SHV-AG-KTM-001',
      scope: 'OPERATOR',
      outletType: 'TICKET_COUNTER',
      applicationStatus: 'VERIFIED_BASIC',
      district: 'Kathmandu',
      municipality: 'Kathmandu Metropolitan',
      placeName: 'Kalanki',
    },
    name: 'Ram Bahadur',
    phone: '9800000000',
    brand: null,
    isUpgrade: false,
    smsStatus: 'QUEUED',
    ...overrides,
  });

  await t.test('returns the agent code — the point of the call', () => {
    assert.equal(built().data.agentCode, 'SM-AG-7K4QP2X');
  });

  await t.test('X7 response is the owner allowlist with complete place and no sensitive fields', () => {
    const data = built({ agent: {
      _id: 'agent-1', code: 'SM-AG-7K4QP2X', scope: 'OPERATOR',
      applicationStatus: 'VERIFIED_BASIC', outletType: 'SOLO', district: 'Kaski',
      municipality: 'Pokhara', placeName: 'Lakeside', panNumber: 'secret-pan',
      citizenshipNumber: 'secret-citizenship', bankAccountNumber: 'secret-bank', adminNotes: 'secret-note',
    } }).data;
    assert.equal(data.applicationStatus, 'VERIFIED_BASIC');
    assert.equal(data.placeName, 'Lakeside');
    assert.deepEqual(Object.keys(data).sort(), [
      'agentCode', 'agentId', 'applicationStatus', 'brand', 'district', 'isUpgrade',
      'municipality', 'name', 'outletType', 'phone', 'placeName',
      'requiresAgentActivation', 'scope', 'smsSent', 'smsStatus',
    ]);
    const json = JSON.stringify(data);
    for (const secret of ['secret-pan', 'secret-citizenship', 'secret-bank', 'secret-note']) {
      assert.equal(json.includes(secret), false);
    }
  });

  await t.test('never returns the temp password', () => {
    const serialised = JSON.stringify(built());
    assert.doesNotMatch(serialised, /tempPassword|password/i);
  });

  await t.test('flags that the agent, not the owner, must activate', () => {
    assert.equal(built().data.requiresAgentActivation, true);
    // An existing account is already activated, so there is nothing to wait for.
    assert.equal(built({ isUpgrade: true }).data.requiresAgentActivation, false);
  });

  await t.test('reports the provider queue result without claiming delivery', () => {
    const queued = built({ smsStatus: 'QUEUED' });
    const failed = built({ smsStatus: 'FAILED' });
    assert.equal(queued.message, 'Agent created. Activation SMS accepted into the provider queue.');
    assert.equal(failed.message, 'Agent created, but the activation SMS could not be queued.');
    assert.equal(failed.data.smsSent, false);
    assert.equal(failed.data.smsStatus, 'FAILED');
    // Identity creation remains successful even when notification is best-effort.
    assert.equal(failed.data.agentCode, 'SM-AG-7K4QP2X');
  });

  await t.test('includes the brand only when one was verified', () => {
    assert.equal(built().data.brand, null);
    // Reads `brandName`, the field OperatorBrand actually has. This assertion
    // previously passed a `name` the schema never stores, which is how the
    // repository's `.select('name')` went unnoticed.
    assert.deepEqual(
      built({ brand: { _id: '507f1f77bcf86cd799439030', brandName: 'Kaski Yatayat' } }).data.brand,
      { id: '507f1f77bcf86cd799439030', name: 'Kaski Yatayat' },
    );
    // A brand loaded without its name still yields a null rather than undefined,
    // so the key is always present on the wire.
    assert.deepEqual(
      built({ brand: { _id: '507f1f77bcf86cd799439030' } }).data.brand,
      { id: '507f1f77bcf86cd799439030', name: null },
    );
  });
});
