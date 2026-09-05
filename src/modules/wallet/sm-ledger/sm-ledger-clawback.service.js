"use strict";

function createSmLedgerClawbackService({
  mongoose,
  SMLedger,
  ScratchCard,
  debitLedgerSimple,
}) {
  return async function clawbackCashback(bookingId, { session: parentSession } = {}) {
    const session = parentSession || await mongoose.startSession();
    if (!parentSession) session.startTransaction();
    try {
      const credits = await SMLedger.find({
        bookingId,
        type: "CASHBACK",
        direction: "CREDIT",
        status: { $in: ["ACTIVE", "USED"] },
      }).session(session);
      let clawedBack = 0;
      let entriesCreated = 0;
      for (const credit of credits) {
        await debitLedgerSimple({
          userId: credit.userId,
          type: "CASHBACK_CLAWBACK",
          amount: credit.amount,
          bookingId,
          relatedLedgerEntryId: credit._id,
          note: `Cashback reversed: booking ${bookingId} cancelled. Original credit: Rs. ${credit.amount}`,
          session,
        });
        credit.status = "CLAWED_BACK";
        credit.remainingAmount = 0;
        await credit.save({ session });
        clawedBack += credit.amount;
        entriesCreated++;
      }
      await ScratchCard.updateMany(
        { bookingId, status: { $in: ["UNSCRATCHED", "SCRATCHED"] } },
        { $set: { status: "CLAWED_BACK" } },
        { session }
      );
      if (!parentSession) await session.commitTransaction();
      return { clawedBack, entriesCreated };
    } catch (error) {
      if (!parentSession) await session.abortTransaction();
      throw error;
    } finally {
      if (!parentSession) await session.endSession();
    }
  };
}

module.exports = { createSmLedgerClawbackService };
