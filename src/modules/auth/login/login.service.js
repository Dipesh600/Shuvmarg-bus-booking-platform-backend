'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const loginRepository = require('./login.repository');
const loginPolicy = require('./login.policy');
const loginMapper = require('./login.mapper');
const { generateTokenPair } = require('../../../../utils/tokenService');
const AppError = require('../../../shared/errors/app-error');

/**
 * Validate presence of required login fields.
 * Returns an AppError (not throws) so the controller shape is uniform.
 */
function validateInput(emailOrPhone, password) {
  if (!emailOrPhone) {
    return new AppError('Email or Phone is required!', 400, {
      success: false, message: 'Email or Phone is required!',
    });
  }
  if (!password) {
    return new AppError('Password is required!', 400, {
      success: false, message: 'Password is required!',
    });
  }
  return null;
}

exports.authenticate = async ({ emailOrPhone, password, appSource, deviceInfo, ipAddress }) => {
  // === INPUT VALIDATION ===
  const validationError = validateInput(emailOrPhone, password);
  if (validationError) throw validationError;

  let user;
  try {
    user = await loginRepository.findUserByEmailOrPhone(emailOrPhone);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('Internal Server Error', 500, {
      success: false, message: 'Internal Server Error',
    }, null, err);
  }

  if (!user) {
    throw new AppError('Invalid credentials!', 401, { success: false, message: 'Invalid credentials!' });
  }

  // === ACCOUNT STATUS CHECKS ===
  loginPolicy.verifyAccountStatus(user);

  // === PASSWORD CHECK ===
  let isMatch;
  try {
    isMatch = await bcrypt.compare(password, user.password);
  } catch (err) {
    throw new AppError('Internal Server Error', 500, {
      success: false, message: 'Internal Server Error',
    }, null, err);
  }

  if (!isMatch) {
    const MAX_ATTEMPTS = 5;
    const LOCK_DURATION_MS = 15 * 60 * 1000;

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

  // === FORCE PASSWORD CHANGE ===
  if (user.forcePasswordChange) {
    let tempToken;
    try {
      tempToken = jwt.sign(
        { id: user._id, purpose: 'FORCE_PASSWORD_CHANGE' },
        process.env.SECRET_KEY,
        { expiresIn: '15m' }
      );
    } catch (err) {
      throw new AppError('Internal Server Error', 500, {
        success: false, message: 'Internal Server Error',
      }, null, err);
    }
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

  // === ROLE RESOLUTION (delegated to policy) ===
  const activeRole = loginPolicy.resolveActiveRole(user, appSource);

  // === SUCCESS — reset counters, record login time ===
  const loginUpdate = {
    $set: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
  };
  if (!user.roles || user.roles.length === 0) {
    loginUpdate.$set.roles = [user.role];
  }
  await loginRepository.recordSuccessfulLogin(user._id, loginUpdate);

  // === TOKEN GENERATION ===
  let tokens;
  try {
    tokens = await generateTokenPair(user, { deviceInfo, ipAddress, activeRole });
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('Internal Server Error', 500, {
      success: false, message: 'Internal Server Error',
    }, null, err);
  }
  const { accessToken, refreshToken } = tokens;

  return {
    statusCode: 200,
    refreshToken,
    responseBody: {
      success: true,
      message: 'Login successful',
      user: loginMapper.toUserResponse(user),
      accessToken,
      activeRole,
    },
  };
};
