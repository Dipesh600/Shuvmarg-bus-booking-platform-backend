'use strict';

const bcrypt = require('bcryptjs');
const AppError = require('../../../shared/errors/app-error');
const referralCodeGenerator = require('../../../../handlers/referralCodeGenerator');
const referralService = require('./referral.service');
const repository = require('./registration.repository');
const mapper = require('./registration.mapper');
const policy = require('./registration.policy');
const { toLegacyCompleteRegError } = require('./registration.errors');

/**
 * Complete-registration orchestrator.
 *
 * Preserves the exact operation order and response contracts from
 * authController.completeRegistration.
 *
 * @param {object} input
 * @returns {Promise<{ statusCode: number, responseBody: object }>}
 */
const completeRegistration = async (input) => {
  const {
    phone, name, email, address, password, gender,
    referralCode, verificationToken: token, ipAddress, deviceInfo,
  } = input;

  try {
    // 1-2. Field and proof validation (throws AppError on failure)
    policy.validateRequiredFields({ phone, name, password, address, gender });
    policy.validateVerificationProof(token, phone);

    // 3. Belt-and-suspenders: used OTP record must exist
    const otpRecord = await repository.findUsedRegistrationOtp(phone);
    if (!otpRecord) {
      throw new AppError('Phone not verified', 400, {
        status: false,
        message: 'Phone number not verified. Please complete OTP verification first.',
      });
    }

    // 4. OTP must be fresh
    policy.validateOtpAge(otpRecord);

    // 5. Global phone uniqueness check
    const { registered } = await repository.isPhoneRegistered(phone);
    if (registered) {
      throw new AppError('Phone already registered', 409, {
        status: false,
        message: 'This phone number is already registered.',
        errorCode: 'PHONE_ALREADY_REGISTERED',
      });
    }

    // 6. Optional email uniqueness
    if (email) {
      const emailExists = await repository.findUserByEmail(email);
      if (emailExists) {
        throw new AppError('Email already exists', 400, {
          status: false,
          message: 'Email already exists!',
        });
      }
    }

    // 7. Password strength
    policy.validatePasswordStrength(password);

    // 8. Hash password (cost 12)
    const hashedPassword = await bcrypt.hash(password, 12);

    // 9. Generate referral code for new user
    const myReferralCode = await referralCodeGenerator.generateReferralCode();

    // 10. Optional incoming referral resolution
    let referralResolution = null;
    if (referralCode) {
      referralResolution = await referralService.resolveReferral(referralCode, phone, repository);
    }

    // 11. Build user document and apply referral if present
    const userData = policy.buildPassengerData({ phone, name, email, address, gender }, hashedPassword, myReferralCode);
    if (referralResolution) {
      userData.referredBy = referralResolution.referredBy;
      userData.yatrapoints = referralResolution.yatrapoints;
      await referralService.applyReferrerReward(referralResolution.referrerUser, repository);
    }

    // 12. Persist new passenger
    const savedUser = await repository.createPassenger(userData);

    // 13. Best-effort referral history
    if (referralCode && referralResolution) {
      await referralService.createReferralHistoryRecord(
        { referredUserId: savedUser._id, referrerUserId: referralResolution.referredBy,
          referralCode, ipAddress, deviceInfo },
        repository
      );
    }

    // 14. Success response
    return mapper.toCompleteRegistrationSuccess(savedUser);
  } catch (error) {
    throw toLegacyCompleteRegError(error);
  }
};

module.exports = { completeRegistration };
