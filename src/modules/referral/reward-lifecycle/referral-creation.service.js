"use strict";

const {
  REFERRAL_EXPIRY_DAYS,
  TOTAL_REFERRAL_REWARD,
} = require("./referral-reward.constants");

const createReferralCreationService = ({
  mongoose,
  repository,
  smLedgerService,
  policy,
  fraudService,
  notificationService,
  logger = console,
}) => async ({
  referrerId,
  referredUserId,
  referralCode,
  ipAddress = null,
  deviceInfo = null,
}) => {
  if (referrerId.toString() === referredUserId.toString()) {
    throw new Error("You cannot refer yourself.");
  }
  const [referrer, referredUser] = await repository.findUsers(
    referrerId,
    referredUserId
  );
  policy.validateReferralCreation({
    referrerId,
    referredUserId,
    referrer,
    referredUser,
  });
  const completedBooking = await repository.findCompletedJourney(
    referredUserId
  );
  if (completedBooking && completedBooking.tripId !== null) {
    throw new Error(
      "Referral code can't be applied after your first trip is completed."
    );
  }
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const expiresAt = new Date(referredUser.createdAt);
    expiresAt.setDate(expiresAt.getDate() + REFERRAL_EXPIRY_DAYS);
    const lockedEntry = await smLedgerService.creditLedger({
      userId: referrerId,
      type: "REFERRAL_LOCKED",
      amount: TOTAL_REFERRAL_REWARD,
      status: "LOCKED",
      note: `Referral reward locked: ${referralCode} used by ${referredUser.name || referredUser.phone}. Unlocks as your friend completes trips.`,
      session,
    });
    const referral = await repository.createReferral(
      {
        referrerId,
        referredUserId,
        referralCode,
        status: "ACTIVE",
        journeysCompleted: 0,
        totalUnlocked: 0,
        lockedRemaining: TOTAL_REFERRAL_REWARD,
        expiresAt,
        lockedLedgerEntryId: lockedEntry._id,
      },
      session
    );
    await repository.tagReferredUser(
      referredUserId,
      referrerId,
      session
    );
    await session.commitTransaction();
    fraudService
      .checkPatterns(referrerId, ipAddress, deviceInfo)
      .catch((error) =>
        logger.error(
          "Referral fraud check failed (non-blocking):",
          error.message
        )
      );
    notificationService
      .friendJoined(referrerId)
      .catch((error) =>
        logger.error(
          "Referral notification failed (non-blocking):",
          error.message
        )
      );
    return referral;
  } catch (error) {
    await session.abortTransaction();
    if (error.code === 11000) {
      throw new Error("This user already has a referral code applied.");
    }
    throw error;
  } finally {
    session.endSession();
  }
};

module.exports = { createReferralCreationService };
