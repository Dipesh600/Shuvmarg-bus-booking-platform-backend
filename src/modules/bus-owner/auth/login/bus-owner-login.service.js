'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const tokenService = require('../../../../../utils/tokenService');
const phoneGuard = require('../../../../../utils/phoneGuard');
const repository = require('./bus-owner-login.repository');
const policy = require('./bus-owner-login.policy');
const errors = require('./bus-owner-login.errors');

const requireInputs = ({ rawPhone, password }) => {
  if (!rawPhone) throw errors.missingPhoneError();
  if (!password) throw errors.missingPasswordError();
};

const assertAccountAllowed = (user) => {
  if (user.deletedAt) throw errors.deletedAccountError();
  if (policy.hasActiveLock(user, new Date())) {
    throw errors.lockedAccountError(policy.lockMinutes(user.lockedUntil, Date.now()));
  }
  if (user.status === 'banned') {
    throw errors.bannedAccountError(policy.bannedMessage(user.suspensionReason));
  }
  if (user.status === 'inactive') {
    throw errors.inactiveAccountError(policy.inactiveMessage(user.suspensionReason));
  }
  if (!policy.resolveRoles(user).includes('busOwner')) {
    throw errors.missingBusOwnerRoleError();
  }
};

const handleInvalidPassword = async (user) => {
  const updatedUser = await repository.incrementFailedLoginAttempts(user._id);
  const count = updatedUser.failedLoginAttempts;
  if (policy.shouldLock(count)) {
    await repository.lockAccount(user._id, policy.lockUntilDate(Date.now()));
  }
  const remaining = policy.attemptsRemaining(count);
  if (remaining > 0) throw errors.invalidPasswordAttemptsError(remaining);
  throw errors.newlyLockedAccountError();
};

const forcePasswordResult = (user) => {
  if (user.temporaryCredentialExpiresAt
    && new Date(user.temporaryCredentialExpiresAt).getTime() <= Date.now()) {
    throw errors.temporaryCredentialExpiredError();
  }
  const tempToken = jwt.sign(
    {
      id: user._id,
      purpose: 'FORCE_PASSWORD_CHANGE',
      activeRole: 'busOwner',
      credentialVersion: Number(user.temporaryCredentialVersion || 0),
      tokenVersion: Number(user.tokenVersion || 0),
    },
    process.env.SECRET_KEY,
    { expiresIn: '15m' },
  );
  return {
    statusCode: 200,
    responseBody: {
      success: true,
      message: 'You must change your temporary password before proceeding.',
      forcePasswordChange: true,
      tempToken,
    },
  };
};

const successResult = async ({ user, deviceInfo, ipAddress }) => {
  await repository.resetLoginSecurityState(user._id, new Date());
  const pair = await tokenService.generateTokenPair(user, {
    deviceInfo,
    ipAddress,
    activeRole: 'busOwner',
  });
  const userObj = user.toObject();
  delete userObj.password;
  return {
    statusCode: 200,
    refreshToken: pair.refreshToken,
    responseBody: {
      success: true,
      message: 'Login successful.',
      user: userObj,
      accessToken: pair.accessToken,
      activeRole: 'busOwner',
    },
  };
};

const login = async ({ rawPhone, password, deviceInfo, ipAddress }) => {
  requireInputs({ rawPhone, password });
  const phone = phoneGuard.normalizePhone(rawPhone);
  const user = await repository.findLoginUser(phone, rawPhone);
  if (!user) throw errors.invalidCredentialsError();
  assertAccountAllowed(user);

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) await handleInvalidPassword(user);
  if (user.forcePasswordChange) return forcePasswordResult(user);
  return successResult({ user, deviceInfo, ipAddress });
};

module.exports = {
  login,
};
