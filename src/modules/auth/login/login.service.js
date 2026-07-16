'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const loginRepository = require('./login.repository');
const loginPolicy = require('./login.policy');
const loginMapper = require('./login.mapper');
const { generateTokenPair } = require('../../../../utils/tokenService');
const AppError = require('../../../shared/errors/app-error');

exports.authenticate = async ({ emailOrPhone, password, appSource, deviceInfo, ipAddress }) => {
  const user = await loginRepository.findUserByEmailOrPhone(emailOrPhone);

  if (!user) {
    throw new AppError('Invalid credentials!', 401, { success: false, message: 'Invalid credentials!' });
  }

  // === ACCOUNT STATUS CHECKS (Locks, bans, deleted, etc) ===
  loginPolicy.verifyAccountStatus(user);

  const isMatch = await bcrypt.compare(password, user.password);

  if (!isMatch) {
    const MAX_ATTEMPTS = 5;
    const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

    const updatedUser = await loginRepository.incrementFailedAttempts(user._id);
    const newFailedCount = updatedUser.failedLoginAttempts;

    if (newFailedCount >= MAX_ATTEMPTS) {
      await loginRepository.lockAccount(user._id, new Date(Date.now() + LOCK_DURATION_MS));
    }

    const remaining = MAX_ATTEMPTS - newFailedCount;
    const message = remaining > 0
      ? `Invalid credentials! ${remaining} attempt(s) remaining.`
      : 'Too many failed attempts. Account locked for 15 minutes.';

    throw new AppError(message, 401, { success: false, message });
  }

  // === FORCE PASSWORD CHANGE CHECK ===
  if (user.forcePasswordChange) {
    const tempToken = jwt.sign(
      { id: user._id, purpose: 'FORCE_PASSWORD_CHANGE' },
      process.env.SECRET_KEY,
      { expiresIn: '15m' }
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
  }

  // === MULTI-ROLE CHECK ===
  const VALID_APP_SOURCES = ['passenger', 'busOwner', 'agent', 'conductor', 'driver'];
  const requestedRole = VALID_APP_SOURCES.includes(appSource) ? appSource : null;

  const userRoles = user.roles && user.roles.length > 0 ? user.roles : [user.role];

  let activeRole;
  if (requestedRole) {
    if (!userRoles.includes(requestedRole)) {
      throw new AppError(
        `You don't have a ${requestedRole} account. Please register first.`,
        403,
        {
          success: false,
          message: `You don't have a ${requestedRole} account. Please register first.`,
          errorCode: 'ROLE_NOT_REGISTERED',
        }
      );
    }
    activeRole = requestedRole;
  } else {
    activeRole = user.role || 'passenger';
  }

  // === SUCCESS — reset counters, record login time, backfill roles ===
  const loginUpdate = {
    $set: {
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
    },
  };

  if (!user.roles || user.roles.length === 0) {
    loginUpdate.$set.roles = [user.role];
  }

  await loginRepository.recordSuccessfulLogin(user._id, loginUpdate);

  // Generate tokens
  const { accessToken, refreshToken } = await generateTokenPair(user, {
    deviceInfo,
    ipAddress,
    activeRole,
  });

  return {
    statusCode: 200,
    refreshToken, // The controller will extract this to set the cookie
    responseBody: {
      success: true,
      message: 'Login successful',
      user: loginMapper.toUserResponse(user),
      accessToken,
      activeRole,
    },
  };
};
