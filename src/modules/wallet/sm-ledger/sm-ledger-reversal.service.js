"use strict";

function createSmLedgerReversalService({ mongoose, SMLedger, creditLedger }) {
  return async function reverseDebit(debitLedgerEntryId) {
    const debitEntry = await SMLedger.findById(debitLedgerEntryId);
    if (!debitEntry) throw new Error("Debit entry not found");
    if (debitEntry.direction !== "DEBIT") {
      throw new Error("Can only reverse DEBIT entries");
    }
    if (debitEntry.type === "CASHBACK_CLAWBACK") {
      throw new Error("Cannot reverse clawbacks via reverseDebit — use admin void");
    }
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      for (const consumption of debitEntry.consumedBy || []) {
        const creditEntryId = consumption.debitLedgerEntryId;
        const credit = await SMLedger.findById(creditEntryId).session(session);
        if (!credit || !["ACTIVE", "USED"].includes(credit.status)) continue;
        const restored = Math.min(
          (credit.remainingAmount || 0) + consumption.amountConsumed,
          credit.amount
        );
        await SMLedger.updateOne(
          { _id: creditEntryId },
          {
            $set: {
              remainingAmount: restored,
              status: restored > 0 ? "ACTIVE" : credit.status,
            },
            $pull: { consumedBy: { debitLedgerEntryId: debitEntry._id } },
          },
          { session }
        );
      }
      await SMLedger.updateOne(
        { _id: debitEntry._id },
        { $set: { note: `${debitEntry.note || ""} [REVERSED]` } },
        { session }
      );
      const reversal = await creditLedger({
        userId: debitEntry.userId,
        type: "DEBIT_REVERSAL",
        amount: debitEntry.amount,
        bookingId: debitEntry.bookingId,
        relatedLedgerEntryId: debitEntry._id,
        note: `SM Money restored: gateway payment failed. Original debit (Rs. ${debitEntry.amount}) reversed.`,
        session,
      });
      await session.commitTransaction();
      return reversal;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  };
}

module.exports = { createSmLedgerReversalService };
