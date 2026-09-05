'use strict';

const { getEffectiveRoles } = require('../../../shared/auth/account-role.policy');

const ACTIVATION_ROLES = new Map([
  ['agent', 'agent'],
  ['conductor', 'conductor'],
  ['driver', 'driver'],
]);

const requestedActivationRole = (rawAppSource) => {
  const key = typeof rawAppSource === 'string'
    ? rawAppSource.trim().toLowerCase()
    : '';
  return ACTIVATION_ROLES.get(key) || null;
};

const activationEligibility = (user, role, options = {}) => {
  if (!role) {
    return {
      state: 'ROLE_REQUIRED',
      statusCode: 400,
      errorCode: 'ACTIVATION_ROLE_REQUIRED',
      message: 'Choose the partner account type you were invited to activate.',
    };
  }

  const holdsRole = user && getEffectiveRoles(user).includes(role);
  if (!user || user.deletedAt || !holdsRole) {
    return {
      state: 'NOT_FOUND',
      statusCode: 404,
      errorCode: 'INVITATION_NOT_FOUND',
      message: `No pending ${role} invitation was found for this phone number.`,
    };
  }

  const needsCrewInvitation = role === 'driver' || role === 'conductor';
  if (user.status === 'invited' && needsCrewInvitation && !options.hasPendingInvitation) {
    return {
      state: 'NOT_FOUND',
      statusCode: 404,
      errorCode: 'INVITATION_NOT_FOUND',
      message: `No pending ${role} invitation was found for this phone number.`,
    };
  }

  if (user.status === 'invited') {
    return { state: 'PENDING', statusCode: 200, errorCode: null, message: null };
  }

  if (user.status === 'active') {
    return {
      state: 'ACTIVE',
      statusCode: 409,
      errorCode: 'ACCOUNT_ALREADY_ACTIVE',
      message: `This ${role} account is already active. Sign in with your password.`,
    };
  }

  return {
    state: 'UNAVAILABLE',
    statusCode: 409,
    errorCode: 'ACTIVATION_NOT_AVAILABLE',
    message: `This ${role} account cannot be activated here. Contact support.`,
  };
};

module.exports = { requestedActivationRole, activationEligibility };
