'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const verification = require('../../../../src/shared/identity/agent-verification');

const { deriveOperatorKycStatus } = verification;

/** A minimally complete OPERATOR agent: recognised outlet type and a place. */
const operatorAgent = (overrides = {}) => ({
  scope: 'OPERATOR',
  applicationStatus: 'DRAFT',
  outletType: 'SOLO',
  district: 'Kaski',
  municipality: 'Pokhara',
  placeName: 'Lakeside',
  ...overrides,
});

test('deriveOperatorKycStatus', async (t) => {
  await t.test('an unproven phone reads as DRAFT', () => {
    assert.equal(deriveOperatorKycStatus(operatorAgent(), { phoneVerified: false }), 'DRAFT');
  });

  await t.test('a proven phone without outlet details reads as PHONE_VERIFIED', () => {
    const agent = operatorAgent({ outletType: null, district: null, municipality: null });
    assert.equal(deriveOperatorKycStatus(agent, { phoneVerified: true }), 'PHONE_VERIFIED');
  });

  await t.test('a proven phone with outlet details reads as VERIFIED_BASIC', () => {
    assert.equal(deriveOperatorKycStatus(operatorAgent(), { phoneVerified: true }), 'VERIFIED_BASIC');
  });

  await t.test('every required outlet field is required', () => {
    for (const field of ['outletType', 'district', 'municipality', 'placeName']) {
      assert.equal(
        deriveOperatorKycStatus(operatorAgent({ [field]: null }), { phoneVerified: true }),
        'PHONE_VERIFIED',
        `a missing ${field} must hold the agent at PHONE_VERIFIED`,
      );
    }
  });

  await t.test('whitespace is not a district', () => {
    const agent = operatorAgent({ district: '   ' });
    assert.equal(deriveOperatorKycStatus(agent, { phoneVerified: true }), 'PHONE_VERIFIED');
  });

  await t.test('an unrecognised outlet type does not count as filled', () => {
    const agent = operatorAgent({ outletType: 'SPACE_STATION' });
    assert.equal(deriveOperatorKycStatus(agent, { phoneVerified: true }), 'PHONE_VERIFIED');
  });

  await t.test('a recognised legacy operationType counts', () => {
    const agent = operatorAgent({ outletType: null, operationType: 'ticket_counter' });
    assert.equal(deriveOperatorKycStatus(agent, { phoneVerified: true }), 'VERIFIED_BASIC');
  });

  await t.test('a missing phoneVerified yields no opinion, never a demotion', () => {
    // The projection guard. If a caller loads the user without `phoneVerified`,
    // reading `undefined` as false would demote a selling agent to DRAFT.
    const agent = operatorAgent({ applicationStatus: 'VERIFIED_BASIC' });
    assert.equal(deriveOperatorKycStatus(agent, {}), null);
    assert.equal(deriveOperatorKycStatus(agent), null);
    assert.equal(deriveOperatorKycStatus(agent, { phoneVerified: 'yes' }), null);
    assert.equal(deriveOperatorKycStatus(agent, { phoneVerified: 1 }), null);
    assert.equal(deriveOperatorKycStatus(agent, { phoneVerified: null }), null);
  });

  await t.test('a PLATFORM agent is never derived', () => {
    const agent = operatorAgent({ scope: 'PLATFORM', applicationStatus: 'PENDING' });
    assert.equal(deriveOperatorKycStatus(agent, { phoneVerified: true }), null);
  });

  await t.test('an agent with no scope at all is never derived', () => {
    // scopeOf falls back to PLATFORM, so this is the PLATFORM machine's business.
    const agent = { applicationStatus: 'DRAFT', district: 'Kaski', municipality: 'Pokhara' };
    assert.equal(deriveOperatorKycStatus(agent, { phoneVerified: true }), null);
  });

  await t.test('a status a human set is never overwritten', () => {
    // SUSPENDED and REJECTED are an admin's call; APPROVED, PENDING and MORE_INFO
    // belong to the PLATFORM review machine. Deriving over any of them would undo
    // a decision this module did not make.
    for (const applicationStatus of ['SUSPENDED', 'REJECTED', 'APPROVED', 'PENDING', 'MORE_INFO']) {
      assert.equal(
        deriveOperatorKycStatus(operatorAgent({ applicationStatus }), { phoneVerified: true }),
        null,
        `${applicationStatus} must be left alone`,
      );
    }
  });

  await t.test('a suspended agent is not revived by verifying their phone', () => {
    const agent = operatorAgent({ applicationStatus: 'SUSPENDED' });
    assert.equal(deriveOperatorKycStatus(agent, { phoneVerified: true }), null);
    assert.equal(verification.isAgentVerificationCleared(agent), false);
  });

  await t.test('an unreadable agent yields no opinion', () => {
    assert.equal(deriveOperatorKycStatus(null, { phoneVerified: true }), null);
    assert.equal(deriveOperatorKycStatus(undefined, { phoneVerified: true }), null);
  });
});

test('agent verification constants', async (t) => {
  await t.test('the derivable set is exactly the OPERATOR progress statuses', () => {
    assert.deepEqual([...verification.DERIVABLE_STATUSES], [
      'DRAFT',
      'PHONE_VERIFIED',
      'VERIFIED_BASIC',
    ]);
  });

  await t.test('constants are frozen', () => {
    assert.throws(() => { verification.DERIVABLE_STATUSES.push('APPROVED'); }, TypeError);
    assert.throws(() => { verification.REQUIRED_OUTLET_FIELDS.push('bankAccount'); }, TypeError);
  });

  await t.test('a shopfront is not required — a SOLO agent must be able to finish', () => {
    assert.equal(verification.REQUIRED_OUTLET_FIELDS.includes('businessName'), false);
    assert.equal(verification.REQUIRED_OUTLET_FIELDS.includes('shopAddress'), false);
    const solo = operatorAgent({ outletType: 'SOLO', businessName: null, shopAddress: null });
    assert.equal(verification.hasRequiredOutletDetails(solo), true);
  });
});
