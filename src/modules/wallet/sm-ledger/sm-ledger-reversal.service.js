"use strict";

const reconciliationError = () => new Error("Debit reversal requires reconciliation before any further credit");

function createSmLedgerReversalService({ mongoose, SMLedger, creditLedger }) {
  return async function reverseDebit(debitLedgerEntryId) {
    const session = await mongoose.startSession();
    try {
      return await session.withTransaction(async () => {
        const debit = await SMLedger.findById(debitLedgerEntryId).session(session);
        if (!debit) throw new Error("Debit entry not found");
        if (debit.direction !== "DEBIT" || debit.type !== "DEBIT") {
          throw new Error("Only booking DEBIT entries can be reversed");
        }
        if (!Number.isFinite(debit.amount) || debit.amount <= 0) throw reconciliationError();

        // Recognize historical compensation without rewriting customer balances.
        // Ambiguous or inconsistent history must be reviewed, never credited again.
        const previous = await SMLedger.find({
          type: "DEBIT_REVERSAL", relatedLedgerEntryId: debit._id,
        }).limit(2).session(session);
        if (previous.length > 1) throw reconciliationError();
        if (previous.length === 1) {
          const reversal = previous[0];
          if (reversal.direction !== "CREDIT" || reversal.amount !== debit.amount
            || String(reversal.userId) !== String(debit.userId)
            || (debit.reversalEntryId && String(debit.reversalEntryId) !== String(reversal._id))) {
            throw reconciliationError();
          }
          return reversal;
        }
        if (debit.reversalEntryId || debit.note?.includes("[REVERSED]")) throw reconciliationError();

        // Competing transactions write the same debit. Mongo retries the loser,
        // which then reads the committed compensation instead of creating another.
        const reversalId = new mongoose.Types.ObjectId();
        const claim = await SMLedger.updateOne(
          { _id: debit._id, reversalEntryId: null },
          { $set: { reversalEntryId: reversalId } }, { session }
        );
        if (claim.modifiedCount !== 1) throw reconciliationError();

        // The compensation is the only restored spendable value. Replenishing the
        // source credits as well would double restoration and erase allocation history.
        return creditLedger({
          entryId: reversalId, userId: debit.userId, type: "DEBIT_REVERSAL",
          amount: debit.amount, bookingId: debit.bookingId, relatedLedgerEntryId: debit._id,
          note: `SM Money restored after failed payment. Original debit: ${debit._id}`,
          session,
        });
      });
    } finally {
      await session.endSession();
    }
  };
}

module.exports = { createSmLedgerReversalService };
