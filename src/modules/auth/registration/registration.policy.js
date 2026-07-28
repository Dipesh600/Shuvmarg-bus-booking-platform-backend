'use strict';

const AppError = require('../../../shared/errors/app-error');
const verificationToken = require('../../../../utils/verificationToken');
const passwordValidator = require('../../../../utils/passwordValidator');

const THIRTY_MINUTES_MS = 30 * 60 * 1000;

/**
 * Assert all required fields are present.
 * Priority: phone > name > password > address > gender.
 * @throws {AppError} 400 with legacy message
 */
const validateRequiredFields = ({ phone, name, password, address, gender }) => {
  if (phone && name && password && address && gender) return;
  const missingField =
    !phone ? 'Phone'
    : !name ? 'Name'
    : !password ? 'Password'
    : !address ? 'Address'
    : 'Gender';
  throw new AppError(`${missingField} required`, 400, {
    status: false,
    message: `${missingField} is required!`,
  });
};

/**
 * Validate the verification token.
 * @throws {AppError} 400 on any failure
 */
const validateVerificationProof = (token, phone) => {
  const result = verificationToken.validateVerificationToken(token, phone, 'REGISTRATION');
  if (!result.valid) {
    throw new AppError('Invalid verification token', 400, {
      status: false,
      message: result.error,
    });
  }
};

/**
 * Assert the used OTP record was created within the last 30 minutes.
 * @throws {AppError} 400 if stale
 */
const validateOtpAge = (otpRecord) => {
  const thirtyMinutesAgo = new Date(Date.now() - THIRTY_MINUTES_MS);
  if (otpRecord.updatedAt < thirtyMinutesAgo) {
    throw new AppError('OTP session expired', 400, {
      status: false,
      message: 'OTP verification expired. Please verify your phone number again.',
    });
  }
};

/**
 * Assert the password meets strength requirements.
 * @throws {AppError} 400 with errors array
 */
const validatePasswordStrength = (password) => {
  const check = passwordValidator.validatePassword(password);
  if (!check.valid) {
    throw new AppError('Weak password', 400, {
      status: false,
      message: check.errors[0],
      errors: check.errors,
    });
  }
};

/**
 * Build the user document fields from validated input.
 * email is lowercased+trimmed and omitted entirely when absent.
 */
const buildPassengerData = ({ phone, name, email, address, gender }, hashedPassword, myReferralCode) => ({
  phone,
  name,
  ...(email ? { email: email.toLowerCase().trim() } : {}),
  address,
  password: hashedPassword,
  gender,
  phoneVerified: true,
  isVerified: true,
  roles: ['passenger'],
  referralCode: myReferralCode,
});

module.exports = {
  validateRequiredFields,
  validateVerificationProof,
  validateOtpAge,
  validatePasswordStrength,
  buildPassengerData,
};
