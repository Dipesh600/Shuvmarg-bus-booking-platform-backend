'use strict';

const bcrypt = require('bcryptjs');
const AppError = require('../../../shared/errors/app-error');
const verificationToken = require('../../../../utils/verificationToken');
const passwordValidator = require('../../../../utils/passwordValidator');
const referralCodeGenerator = require('../../../../handlers/referralCodeGenerator');
const referralService = require('./referral.service');
const repository = require('./registration.repository');
const mapper = require('./registration.mapper');
const { toLegacyCompleteRegError } = require('./registration.errors');

const THIRTY_MINUTES_MS = 30 * 60 * 1000;

/**
 * Complete-registration service.
 *
 * Preserves the exact operation order and response contracts from
 * authController.completeRegistration.
 *
 * @param {object} input
 * @returns {Promise<{ statusCode: number, responseBody: object }>}
 */
const completeRegistration = async (input) => {
  const { phone, name, email, address, password, gender, referralCode,
    verificationToken: token, ipAddress, deviceInfo } = input;

  try {
    // 1. Required-field validation
    if (!phone || !name || !password || !address || !gender) {
      const missingField = !phone ? 'Phone' : !name ? 'Name' : !password ? 'Password'
        : !address ? 'Address' : 'Gender';
      throw new AppError(`${missingField} required`, 400, {
        status: false,
        message: `${missingField} is required!`,
      });
    }

    // 2. Verify verification token (AUTH-01.02)
    const tokenResult = verificationToken.validateVerificationToken(token, phone, 'REGISTRATION');
    if (!tokenResult.valid) {
      throw new AppError('Invalid verification token', 400, {
        status: false,
        message: tokenResult.error,
      });
    }

    // 3. Belt-and-suspenders: used OTP record must exist
    const otpRecord = await repository.findUsedRegistrationOtp(phone);
    if (!otpRecord) {
      throw new AppError('Phone not verified', 400, {
        status: false,
        message: 'Phone number not verified. Please complete OTP verification first.',
      });
    }

    // 4. OTP verification must have happened within 30 minutes
    const thirtyMinutesAgo = new Date(Date.now() - THIRTY_MINUTES_MS);
    if (otpRecord.updatedAt < thirtyMinutesAgo) {
      throw new AppError('OTP session expired', 400, {
        status: false,
        message: 'OTP verification expired. Please verify your phone number again.',
      });
    }

    // 5. Global phone uniqueness check
    const { registered } = await repository.isPhoneRegistered(phone);
    if (registered) {
      throw new AppError('Phone already registered', 409, {
        status: false,
        message: 'This phone number is already registered.',
        errorCode: 'PHONE_ALREADY_REGISTERED',
      });
    }

    // 6. Email uniqueness (only if email supplied)
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
    const passwordCheck = passwordValidator.validatePassword(password);
    if (!passwordCheck.valid) {
      throw new AppError('Weak password', 400, {
        status: false,
        message: passwordCheck.errors[0],
        errors: passwordCheck.errors,
      });
    }

    // 8. Hash password (cost 12 — 2024 production standard)
    const hashedPassword = await bcrypt.hash(password, 12);

    // 9. Generate this user's own referral code
    const myReferralCode = await referralCodeGenerator.generateReferralCode();

    // 10. Resolve incoming referral code (optional)
    let referralResolution = null;
    if (referralCode) {
      referralResolution = await referralService.resolveReferral(referralCode, phone, repository);
    }

    // 11. Build user document fields
    const userData = {
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
    };
    if (referralResolution) {
      userData.referredBy = referralResolution.referredBy;
      userData.yatrapoints = referralResolution.yatrapoints;
      // Persist referrer reward before writing the new user
      await referralService.applyReferrerReward(referralResolution.referrerUser, repository);
    }

    // 12. Create passenger user
    const savedUser = await repository.createPassenger(userData);

    // 13. Best-effort referral history
    if (referralCode && referralResolution) {
      await referralService.createReferralHistoryRecord(
        { referredUserId: savedUser._id, referrerUserId: referralResolution.referredBy,
          referralCode, ipAddress, deviceInfo },
        repository
      );
    }

    return mapper.toCompleteRegistrationSuccess(savedUser);
  } catch (error) {
    throw toLegacyCompleteRegError(error);
  }
};

module.exports = { completeRegistration };
