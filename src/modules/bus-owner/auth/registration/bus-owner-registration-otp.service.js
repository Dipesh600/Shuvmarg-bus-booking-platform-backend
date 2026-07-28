'use strict';

const phoneGuard = require('../../../../../utils/phoneGuard');
const otpHelper = require('../../../../../utils/otpHelper');
const verificationToken = require('../../../../../utils/verificationToken');
const leadRepository = require('./bus-owner-registration-lead.repository');
const policy = require('./bus-owner-registration.policy');
const errors = require('./bus-owner-registration.errors');

const neutralSendBody = {
  success: true,
  message: 'If this number is eligible, a verification code has been sent.',
};

const sendOTP = async ({ phone }) => {
  if (!phone) throw errors.missingPhoneError();
  if (!policy.isValidNepalMobile(phone)) throw errors.invalidNepalPhoneError();
  const { exists, hasRole, user } = await phoneGuard.checkPhoneForRole(phone, 'busOwner');
  if (exists && hasRole) return { statusCode: 200, responseBody: neutralSendBody };
  if (exists && user && (user.status === 'banned' || user.status === 'inactive')) {
    return { statusCode: 200, responseBody: neutralSendBody };
  }
  try {
    await otpHelper.createAndSendOTP(phone, policy.BUS_OWNER_PURPOSE);
  } catch (err) {
    if (policy.isOtpBlocked(err)) throw errors.otpSendBlockedError(policy.otpBlockedMinutes(err));
    if (policy.isOtpCooldown(err)) throw errors.otpSendCooldownError(policy.otpCooldownSeconds(err));
    throw err;
  }
  return { statusCode: 200, responseBody: neutralSendBody };
};

const verifyOTP = async ({ phone, otp }) => {
  if (!phone || !otp) throw errors.missingVerifyInputError();
  const cleanOtp = policy.cleanOtp(otp);
  if (!policy.isSixDigitOtp(cleanOtp)) throw errors.invalidOtpLengthError();
  const result = await otpHelper.verifyOTPCode(phone, cleanOtp, policy.BUS_OWNER_PURPOSE);
  if (!result.valid) throw errors.invalidOtpError(result.error);
  const { exists, hasRole, user } = await phoneGuard.checkPhoneForRole(phone, 'busOwner');
  if (exists && hasRole) throw errors.roleAlreadyRegisteredError();
  leadRepository.upsertOtpVerifiedLead(phone)
    .catch((err) => console.error('[PartnerLead upsert - verifyOTP] Non-fatal:', err.message));
  const token = verificationToken.issueVerificationToken(phone, policy.BUS_OWNER_PURPOSE);
  return {
    statusCode: 200,
    responseBody: {
      success: true,
      message: exists
        ? 'Phone verified. Existing account found — complete your operator setup.'
        : 'Phone verified successfully. Complete your registration.',
      exists,
      userName: exists && user ? user.name : null,
      verificationToken: token,
    },
  };
};

const resendOTP = async ({ phone }) => {
  if (!phone) throw errors.missingPhoneError();
  const { exists, hasRole } = await phoneGuard.checkPhoneForRole(phone, 'busOwner');
  if (exists && hasRole) throw errors.roleAlreadyRegisteredError();
  let result;
  try {
    result = await otpHelper.createAndSendOTP(phone, policy.BUS_OWNER_PURPOSE);
  } catch (err) {
    if (policy.isOtpBlocked(err)) throw errors.otpSendBlockedError(policy.otpBlockedMinutes(err));
    if (policy.isOtpCooldown(err)) throw errors.otpSendCooldownError(policy.otpCooldownSeconds(err));
    throw err;
  }
  return {
    statusCode: 200,
    responseBody: {
      success: true,
      message: 'New verification code sent.',
      data: { expiresIn: result.expiresIn },
    },
  };
};

module.exports = {
  sendOTP,
  verifyOTP,
  resendOTP,
};
