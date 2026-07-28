"use strict";

const {
  TOTAL_REFERRAL_REWARD,
} = require("./referral-reward.constants");

const createReferralUnlockService = ({
  mongoose,
  repository,
  smLedgerService,
  policy,
  notificationService,
}) => async (referredUserId, bookingId) => {
  const referral = await repository.findActiveReferral(referredUserId);
  if (!referral) return null;
  const booking = await repository.findBooking(bookingId);
  const progress = policy.validateJourneyUnlock({
    referral,
    booking,
    referredUserId,
    bookingId,
  });
  if (!progress) return null;
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const unlockEntry = await smLedgerService.creditLedger({
      userId: referral.referrerId,
      type: "REFERRAL_UNLOCK",
      amount: progress.amountUnlocked,
      referralId: referral._id,
      bookingNumber: progress.journeyNumber,
      note: `Referral unlock: friend completed trip #${progress.journeyNumber}. NPR ${progress.amountUnlocked} unlocked.`,
      session,
    });
    await repository.updateUnlock(
      referral._id,
      progress,
      {
        bookingId,
        journeyNumber: progress.journeyNumber,
        amountUnlocked: progress.amountUnlocked,
        ledgerEntryId: unlockEntry._id,
        unlockedAt: new Date(),
      },
      session
    );
    if (
      progress.status === "FULLY_UNLOCKED" &&
      referral.lockedLedgerEntryId
    ) {
      await repository.markLockedLedger(
        referral.lockedLedgerEntryId,
        "USED",
        session
      );
    }
    await session.commitTransaction();
    await repository.findReferrerName(referral.referrerId);
    if (progress.status === "FULLY_UNLOCKED") {
      notificationService
        .fullyUnlocked(referral.referrerId, TOTAL_REFERRAL_REWARD)
        .catch(() => {});
    } else {
      const balance = await smLedgerService.computeSpendableBalance(
        referral.referrerId
      );
      notificationService
        .partiallyUnlocked(
          referral.referrerId,
          progress.amountUnlocked,
          balance
        )
        .catch(() => {});
    }
    return {
      referralId: referral._id,
      ...progress,
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

module.exports = { createReferralUnlockService };
