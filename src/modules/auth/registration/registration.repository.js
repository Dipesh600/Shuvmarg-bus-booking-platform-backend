'use strict';

const User = require('../../../../models/userModel');
const OTP = require('../../../../models/otpModel');
const ReferralHistory = require('../../../../models/referralModel');
const phoneGuard = require('../../../../utils/phoneGuard');

/**
 * Check if a phone is registered under any role.
 * Delegates to the existing phoneGuard helper.
 */
const isPhoneRegistered = (phone) => phoneGuard.isPhoneRegistered(phone);

/**
 * Find a consumed REGISTRATION OTP record for the given phone.
 */
const findUsedRegistrationOtp = (phone) =>
  OTP.findOne({ phone, purpose: 'REGISTRATION', isUsed: true });

/**
 * Find a user by email address.
 */
const findUserByEmail = (email) => User.findOne({ email });

/**
 * Find a user by their referral code.
 */
const findUserByReferralCode = (referralCode) => User.findOne({ referralCode });

/**
 * Save updated referrer document (increment totalReferrals, add points).
 */
const saveReferrerReward = (referrer) => referrer.save();

/**
 * Create and persist a new passenger user document.
 * @param {object} userData - Fields to create the user with.
 * @returns {Promise<User>}
 */
const createPassenger = async (userData) => {
  const user = new User(userData);
  return user.save();
};

/**
 * Create and persist a ReferralHistory record.
 * @param {object} data
 * @returns {Promise<ReferralHistory>}
 */
const createReferralHistory = async (data) => {
  const record = new ReferralHistory(data);
  return record.save();
};

module.exports = {
  isPhoneRegistered,
  findUsedRegistrationOtp,
  findUserByEmail,
  findUserByReferralCode,
  saveReferrerReward,
  createPassenger,
  createReferralHistory,
};
