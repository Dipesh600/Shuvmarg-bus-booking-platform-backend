'use strict';
const registrationProof = require('../../../shared/auth/registration-proof');

const bcrypt = require('bcryptjs');
const AppError = require('../../../shared/errors/app-error');
const referralCodeGenerator = require('../../../../handlers/referralCodeGenerator');
const referralService = require('./referral.service');
const repository = require('./registration.repository');
const mapper = require('./registration.mapper');
const policy = require('./registration.policy');
const { toLegacyCompleteRegError } = require('./registration.errors');

// ─── Private helpers (steps 3-4, 5-6, 8-9, 10-11, 13) ───────────────────────

const _assertOtpProof = async (phone) => {
  const otpRecord = await repository.findUsedRegistrationOtp(phone);
  if (!otpRecord) {
    throw new AppError('Phone not verified', 400, {
      status: false,
      message: 'Phone number not verified. Please complete OTP verification first.',
    });
  }
  policy.validateOtpAge(otpRecord); // step 4
};

const _assertUniqueness = async (phone, email) => {
  const { registered } = await repository.isPhoneRegistered(phone);
  if (registered) {
    throw new AppError('Phone already registered', 409, {
      status: false,
      message: 'This phone number is already registered.',
      errorCode: 'PHONE_ALREADY_REGISTERED',
    });
  }
  if (email) {
    const emailExists = await repository.findUserByEmail(email);
    if (emailExists) {
      throw new AppError('Email already exists', 400, {
        status: false,
        message: 'Email already exists!',
      });
    }
  }
};

const _hashAndBuild = async (fields, password) => {
  policy.validatePasswordStrength(password); // step 7
  const hashedPassword = await bcrypt.hash(password, 12); // step 8
  const myReferralCode = await referralCodeGenerator.generateReferralCode(); // step 9
  return policy.buildPassengerData(fields, hashedPassword, myReferralCode);
};

const _resolveReferral = async (referralCode, phone, userData) => {
  if (!referralCode) return null;
  const resolution = await referralService.resolveReferral(referralCode, phone, repository);
  userData.referredBy = resolution.referredBy; // step 10
  userData.yatrapoints = resolution.yatrapoints;
  await referralService.applyReferrerReward(resolution.referrerUser, repository); // step 11
  return resolution;
};

const _recordHistory = async (referralCode, resolution, savedUserId, ipAddress, deviceInfo) => {
  if (!referralCode || !resolution) return;
  await referralService.createReferralHistoryRecord( // step 13 – best-effort
    { referredUserId: savedUserId, referrerUserId: resolution.referredBy,
      referralCode, ipAddress, deviceInfo },
    repository
  );
};

// ─── Orchestrator ─────────────────────────────────────────────────────────────

const completeRegistration = async (input) => {
  const {
    phone, name, email, address, password, gender,
    referralCode, verificationToken: token, ipAddress, deviceInfo,
  } = input;

  try {
    policy.validateRequiredFields({ phone, name, password, address, gender }); // 1
    policy.validateVerificationProof(token, phone);                            // 2
    await _assertOtpProof(phone);                                              // 3-4
    await _assertUniqueness(phone, email);                                     // 5-6
    const userData = await _hashAndBuild(                                      // 7-9
      { phone, name, email, address, gender }, password
    );
    await registrationProof.consume(token, phone, 'REGISTRATION');
    const resolution = await _resolveReferral(referralCode, phone, userData); // 10-11
    const savedUser = await repository.createPassenger(userData);              // 12
    await _recordHistory(referralCode, resolution, savedUser._id,              // 13
      ipAddress, deviceInfo);
    return mapper.toCompleteRegistrationSuccess(savedUser);                    // 14
  } catch (error) {
    throw toLegacyCompleteRegError(error);
  }
};

module.exports = { completeRegistration };
