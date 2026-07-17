'use strict';

const bcrypt = require('bcryptjs');
const passwordValidator = require('../../../../utils/passwordValidator');
const tokenService = require('../../../../utils/tokenService');
const AppError = require('../../../shared/errors/app-error');
const repository = require('./update-password.repository');
const policy = require('./update-password.policy');
const errors = require('./update-password.errors');

const MAX_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

const rejectIncorrectPassword = async (user) => {
  const updatedUser = await repository.recordFailedPasswordAttempt(
    user._id,
    new Date(Date.now() + LOCK_DURATION_MS)
  );
  const newFailedCount = updatedUser.failedLoginAttempts;
  const remaining = MAX_ATTEMPTS - newFailedCount;
  if (remaining > 0) {
    throw errors.incorrectCurrentPasswordError(remaining);
  }
  throw errors.accountLockedError();
};

const clearFailedStateIfNeeded = async (user) => {
  if (user.failedLoginAttempts > 0 || user.lockedUntil) {
    await repository.clearFailedPasswordState(user._id);
  }
};

const updatePassword = async (input) => {
  try {
    const { userId, oldPassword, newPassword } = input;
    policy.requireAuthenticatedUser(userId);
    policy.requirePasswords(oldPassword, newPassword);
    policy.requireValidNewPassword(passwordValidator.validatePassword(newPassword));

    const user = await repository.findByIdWithPassword(userId);
    if (!user) throw errors.userNotFoundError();

    const isOldPasswordValid = await bcrypt.compare(oldPassword, user.password);
    if (!isOldPasswordValid) await rejectIncorrectPassword(user);

    await clearFailedStateIfNeeded(user);
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) throw errors.samePasswordError();

    const hashedNewPassword = await bcrypt.hash(newPassword, 12);
    await repository.updatePasswordHash(userId, hashedNewPassword);
    await tokenService.revokeAllUserTokens(userId);

    return {
      statusCode: 200,
      responseBody: {
        status: true,
        message: 'Password updated successfully! Please login again on all devices.',
      },
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw errors.updatePasswordFailedError(error);
  }
};

module.exports = { updatePassword };
