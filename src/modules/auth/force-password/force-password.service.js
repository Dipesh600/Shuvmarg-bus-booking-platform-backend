'use strict';
const { getEffectiveRoles } = require('../../../shared/auth/account-role.policy');

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const otpHelper = require('../../../../utils/otpHelper');
const passwordValidator = require('../../../../utils/passwordValidator');
const tokenService = require('../../../../utils/tokenService');
const AppError = require('../../../shared/errors/app-error');
const repository = require('./force-password.repository');
const policy = require('./force-password.policy');
const errors = require('./force-password.errors');

const verifyTempToken = (tempToken) => {
  try {
    return jwt.verify(tempToken, process.env.SECRET_KEY);
  } catch (error) {
    throw errors.invalidTempTokenError();
  }
};

const verifyOptionalOtp = async (phone, otp) => {
  if (!phone || !otp) return;
  const otpResult = await otpHelper.verifyOTPCode(phone, otp, 'ACCOUNT_ACTIVATION');
  if (!otpResult.valid) {
    throw errors.invalidOtpError(otpResult.error);
  }
};

const sanitizeUser = (freshUser) => {
  const userWithoutPassword = freshUser.toObject();
  delete userWithoutPassword.password;
  return userWithoutPassword;
};

const changeForcePassword = async (input) => {
  try {
    const { tempToken, newPassword, phone, otp, deviceInfo, ipAddress } = input;
    policy.requireFields(tempToken, newPassword);
    const decoded = verifyTempToken(tempToken);
    policy.requireForcePasswordPurpose(decoded);
    policy.requireValidPassword(passwordValidator.validatePassword(newPassword));
    await verifyOptionalOtp(phone, otp);

    const user = await repository.findByIdWithPassword(decoded.id);
    if (!user) throw errors.userNotFoundError();
    if (!user.forcePasswordChange) throw errors.passwordChangeNotRequiredError();
    const roles = getEffectiveRoles(user);
    if (
      user.deletedAt
      || (user.status && user.status !== 'active')
      || !roles.includes(decoded.activeRole)
    ) {
      throw errors.accountUnavailableError();
    }
    if (
      !Number.isInteger(decoded.credentialVersion) || decoded.credentialVersion < 0
      || !Number.isInteger(decoded.tokenVersion) || decoded.tokenVersion < 0
      || (
        decoded.credentialVersion !== Number(user.temporaryCredentialVersion || 0)
        || (user.temporaryCredentialExpiresAt
          && new Date(user.temporaryCredentialExpiresAt).getTime() <= Date.now())
        || decoded.tokenVersion !== Number(user.tokenVersion || 0)
      )
    ) {
      throw errors.credentialStateError();
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    const consumed = await repository.saveForcedPasswordChange(user, hashedPassword, {
      credentialVersion: decoded.credentialVersion,
      tokenVersion: decoded.tokenVersion,
      activeRole: decoded.activeRole,
      phoneVerified: Boolean(phone && otp),
    });
    if (!consumed) throw errors.credentialStateError();
    await tokenService.revokeAllUserTokens(user._id);
    const freshUser = await repository.findFreshUser(user._id);
    const { accessToken, refreshToken } = await tokenService.generateTokenPair(freshUser, {
      deviceInfo,
      ipAddress,
      activeRole: decoded.activeRole || freshUser.role || 'passenger',
    });

    return {
      statusCode: 200,
      refreshToken,
      activeRole: decoded.activeRole || freshUser.role || 'passenger',
      responseBody: {
        success: true,
        message: 'Password changed successfully. Welcome!',
        user: sanitizeUser(freshUser),
        accessToken,
      },
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw errors.forcePasswordFailedError(error);
  }
};

module.exports = { changeForcePassword };
