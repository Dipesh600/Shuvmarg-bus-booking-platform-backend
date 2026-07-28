'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const loginRepository = require('./login.repository');
const loginPolicy = require('./login.policy');
const loginMapper = require('./login.mapper');
const { generateTokenPair } = require('../../../../utils/tokenService');
const AppError = require('../../../shared/errors/app-error');

// ─── Error boundary ──────────────────────────────────────────────────────────

const toLegacyInternalError = (error) => {
  if (error instanceof AppError) return error;
  return new AppError(
    'Internal Server Error',
    500,
    { success: false, message: 'Internal Server Error' },
    null,
    error
  );
};

// ─── Input validation ────────────────────────────────────────────────────────

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

// ─── Authentication flow ─────────────────────────────────────────────────────

const runAuthentication = async ({ emailOrPhone, password, appSource, deviceInfo, ipAddress }) => {
  const validationError = validateInput(emailOrPhone, password);
  if (validationError) throw validationError;

  const user = await loginRepository.findUserByEmailOrPhone(emailOrPhone);

  if (!user) {
    throw new AppError('Invalid credentials!', 401, {
      success: false, message: 'Invalid credentials!',
    });
  }

  loginPolicy.verifyAccountStatus(user);

  // Guard: passenger accounts created via phone OTP have no password.
  // Attempting bcrypt.compare against a null/missing hash would throw or produce
  // an incorrect result. Block early with a typed error so the client can redirect
  // to the OTP authentication flow.
  // This check runs AFTER verifyAccountStatus so banned/inactive accounts still
  // receive the account-restriction response rather than a password-state hint.
  // Do NOT increment failedLoginAttempts — this is not a credential failure.
  const hasUsablePassword = !!(user.password && user.password.length > 0);
  if (!hasUsablePassword) {
    throw new AppError(
      'This account does not have a password. Please continue with phone verification.',
      401,
      {
        success: false,
        message: 'This account does not have a password. Please continue with phone verification.',
        errorCode: 'PASSWORD_NOT_SET',
      },
    );
  }

  const isMatch = await bcrypt.compare(password, user.password);

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

  const activeRole = loginPolicy.resolveActiveRole(user, appSource);

  const loginUpdate = {
    $set: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
  };
  if (!user.roles || user.roles.length === 0) {
    loginUpdate.$set.roles = [user.role];
  }
  await loginRepository.recordSuccessfulLogin(user._id, loginUpdate);

  const { accessToken, refreshToken } = await generateTokenPair(user, {
    deviceInfo, ipAddress, activeRole,
  });

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

// ─── Public export with error boundary ───────────────────────────────────────

exports.authenticate = async (input) => {
  try {
    return await runAuthentication(input);
  } catch (error) {
    throw toLegacyInternalError(error);
  }
};
