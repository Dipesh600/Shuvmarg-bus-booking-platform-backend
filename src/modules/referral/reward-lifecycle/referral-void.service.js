"use strict";

const createReferralVoidService = ({
  mongoose,
  repository,
  smLedgerService,
}) => async (referralId, adminId, reason) => {
  const referral = await repository.findReferralById(referralId);
  if (!referral) throw new Error("Referral not found.");
  if (referral.status === "VOIDED") {
    throw new Error("Referral is already voided.");
  }
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    let totalDebited = 0;
    for (const unlock of referral.unlockHistory) {
      await smLedgerService.debitLedgerSimple({
        userId: referral.referrerId,
        type: "ADMIN_DEBIT",
        amount: unlock.amountUnlocked,
        referralId: referral._id,
        relatedLedgerEntryId: unlock.ledgerEntryId,
        note: `Referral voided by admin: ${reason}. Reversing unlock #${unlock.journeyNumber} (NPR ${unlock.amountUnlocked}).`,
        session,
      });
      totalDebited += unlock.amountUnlocked;
    }
    if (referral.lockedLedgerEntryId) {
      await repository.markLockedLedger(
        referral.lockedLedgerEntryId,
        "VOIDED",
        session
      );
    }
    referral.status = "VOIDED";
    referral.voidedBy = adminId;
    referral.voidedAt = new Date();
    referral.voidReason = reason;
    await referral.save({ session });
    await session.commitTransaction();
    return {
      referralId: referral._id,
      totalDebited,
      unlocksReversed: referral.unlockHistory.length,
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

module.exports = { createReferralVoidService };
