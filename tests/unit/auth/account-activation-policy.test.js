'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  requestedActivationRole,
  activationEligibility,
} = require('../../../src/modules/auth/account-activation/account-activation.policy');

test('activation requires an explicit partner-app role', () => {
  assert.equal(requestedActivationRole(' DRIVER '), 'driver');
  assert.equal(requestedActivationRole('agent'), 'agent');
  assert.equal(requestedActivationRole('passenger'), null);
  assert.equal(activationEligibility(null, null).errorCode, 'ACTIVATION_ROLE_REQUIRED');
});

test('activation distinguishes pending, active, unavailable, and absent role states', () => {
  const invited = { role: 'driver', roles: ['driver'], status: 'invited', deletedAt: null };
  const active = { ...invited, status: 'active' };
  const suspended = { ...invited, status: 'inactive' };

  assert.equal(
    activationEligibility(invited, 'driver', { hasPendingInvitation: true }).state,
    'PENDING',
  );
  assert.equal(
    activationEligibility(invited, 'driver', { hasPendingInvitation: false }).errorCode,
    'INVITATION_NOT_FOUND',
  );
  assert.equal(
    activationEligibility({ ...invited, role: 'agent', roles: ['agent'] }, 'agent').state,
    'PENDING',
  );
  assert.equal(activationEligibility(active, 'driver').errorCode, 'ACCOUNT_ALREADY_ACTIVE');
  assert.equal(activationEligibility(suspended, 'driver').errorCode, 'ACTIVATION_NOT_AVAILABLE');
  assert.equal(activationEligibility(invited, 'conductor').errorCode, 'INVITATION_NOT_FOUND');
  assert.equal(activationEligibility(null, 'driver').errorCode, 'INVITATION_NOT_FOUND');
  assert.equal(
    activationEligibility({ ...invited, deletedAt: new Date() }, 'driver').errorCode,
    'INVITATION_NOT_FOUND',
  );
});
