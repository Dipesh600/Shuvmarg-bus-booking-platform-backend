'use strict';

const AppError = require('../../../shared/errors/app-error');
const referralCodeGenerator = require('../../../../handlers/referralCodeGenerator');

/**
 * Validate the referral code format and resolve the referrer user.
 *
 * @param {string} referralCode
 * @param {string} newUserPhone
 * @param {object} repository
 * @returns {Promise<{ referredBy: ObjectId, yatrapoints: number, referrerUser: object }>}
 * @throws {AppError} on invalid format, unknown code, or self-referral
 */
const resolveReferral = async (referralCode, newUserPhone, repository) => {
  if (!referralCodeGenerator.validateReferralCode(referralCode)) {
    throw new AppError('Invalid referral code format', 400, {
      status: false,
      message: 'Invalid referral code format',
    });
  }

  const referrerUser = await repository.findUserByReferralCode(referralCode);
  if (!referrerUser) {
    throw new AppError('Invalid referral code', 400, {
      status: false,
      message: 'Invalid referral code',
    });
  }

  if (referrerUser.phone === newUserPhone) {
    throw new AppError('Self-referral', 400, {
      status: false,
      message: 'You cannot refer yourself',
    });
  }

  return { referredBy: referrerUser._id, yatrapoints: 10, referrerUser };
};

/**
 * Increment the referrer's totalReferrals and add 10 yatrapoints, then save.
 */
const applyReferrerReward = async (referrerUser, repository) => {
  referrerUser.totalReferrals += 1;
  referrerUser.yatrapoints += 10;
  await repository.saveReferrerReward(referrerUser);
};

/**
 * Create the ReferralHistory record. Swallows failure intentionally so
 * registration still succeeds even if the history write fails.
 */
const createReferralHistoryRecord = async (data, repository) => {
  try {
    await repository.createReferralHistory({
      referredUserId: data.referredUserId,
      referrerUserId: data.referrerUserId,
      referredUserPoints: 10,
      referrerPoints: 10,
      usedReferralCode: data.referralCode.toUpperCase(),
      status: 'completed',
      rewardType: 'refral_point',
      metadata: {
        ipAddress: data.ipAddress || null,
        deviceInfo: data.deviceInfo || null,
      },
      pointsCredited: true,
    });
    console.log(
      `Referral history created: User ${data.referredUserId} used code ${data.referralCode} from User ${data.referrerUserId}`
    );
  } catch (referralError) {
    console.error('Error creating referral history:', referralError);
  }
};

module.exports = { resolveReferral, applyReferrerReward, createReferralHistoryRecord };
