'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const policy = require('../../../src/modules/bus-owner/agent-invite/bus-owner-agent-invite.policy');

test('the invited User', async (t) => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  const built = () => policy.invitedAgentUser({
    name: 'Ram Bahadur',
    phone: '9800000000',
    hashedPassword: '$2a$12$abcdefghijklmnopqrstuv',
    now,
  });

  await t.test('starts at status "invited", which login refuses', () => {
    // This is the security boundary: the owner chose the password, so the
    // account must be unusable until the agent activates it themselves.
    assert.equal(built().status, 'invited');
    assert.notEqual(built().status, 'active');
  });

  await t.test('is flagged to force a password change', () => {
    assert.equal(built().forcePasswordChange, true);
  });

  await t.test('is not treated as verified on the owner\'s word', () => {
    // The owner typed the number. The agent has not proved they hold it.
    assert.equal(built().phoneVerified, false);
    assert.equal(built().isVerified, false);
  });

  await t.test('holds the agent role and only the agent role', () => {
    assert.deepEqual(built().roles, ['agent']);
    assert.equal(built().role, 'agent');
  });

  await t.test('stores the hash it was given, never a plaintext password', () => {
    assert.equal(built().password, '$2a$12$abcdefghijklmnopqrstuv');
    assert.equal(Object.hasOwn(built(), 'tempPassword'), false);
  });
});

test('the new Agent identity', async (t) => {
  const built = () => policy.newOperatorAgent({
    userId: '507f1f77bcf86cd799439013',
    ownerId: '507f1f77bcf86cd799439011',
    outletType: 'TICKET_COUNTER',
    district: 'Kathmandu',
    municipality: 'Kathmandu Metropolitan',
    placeName: 'Kalanki',
  });

  await t.test('X2/X3 is OPERATOR scope at VERIFIED_BASIC', () => {
    assert.equal(built().scope, 'OPERATOR');
    assert.equal(built().applicationStatus, 'VERIFIED_BASIC');
    assert.equal(built().placeName, 'Kalanki');
  });

  await t.test('records provenance but no selling right', () => {
    assert.equal(built().createdByOwnerId, '507f1f77bcf86cd799439011');
    // No linkedOperatorId, no commission: those are terms of an assignment.
    assert.equal(Object.hasOwn(built(), 'linkedOperatorId'), false);
    assert.equal(Object.hasOwn(built(), 'commissionRate'), false);
    assert.equal(Object.hasOwn(built(), 'busAccessScope'), false);
  });

  await t.test('never presets a code — the model hook allocates it', () => {
    assert.equal(Object.hasOwn(built(), 'code'), false);
    assert.equal(Object.hasOwn(built(), 'agentId'), false);
  });
});

test('invite SMS', async (t) => {
  const body = (brandName) => policy.smsBody({
    name: 'Ram Bahadur',
    phone: '9800000000',
    tempPassword: 'A1B2C3D4E5', // ggignore
    brandName,
  });

  await t.test('carries the phone and the temp password', () => {
    assert.match(body(), /9800000000/);
    assert.match(body(), /A1B2C3D4E5/);
  });

  await t.test('names the brand when there is one, and omits it cleanly when not', () => {
    assert.match(body('Kaski Yatayat'), /by Kaski Yatayat/);
    assert.doesNotMatch(body(), /by undefined|by null/);
  });

  await t.test('tells the agent to change the password', () => {
    assert.match(body(), /change your password/i);
  });
});
