"use strict";
const { withMongoTransaction } = require("../../../shared/with-mongo-transaction");
const { toMinorUnits, fromMinorUnits } = require("../../../shared/money");

function createSmLedgerFifoDebitService({
  mongoose,
  SMLedger,
  toObjectId,
  lockWalletForDebit,
  now = () => new Date(),
}) {
  return async function debitLedgerFIFO({
    userId,
    amount,
    bookingId = null,
    note = null,
    session: existingSession = null,
    operationKey = null, paymentContext = null,
  }) {
    if (amount <= 0) throw new Error("Debit amount must be greater than zero");
    const requestedMinor = toMinorUnits(amount, { allowZero: false });
    const userOid = toObjectId(userId);
    return withMongoTransaction(mongoose, existingSession, async session => {
      if (operationKey) {
        const previous = await SMLedger.findOne({ operationKey }).session(session);
        if (previous) {
          if (String(previous.userId) !== String(userOid) || toMinorUnits(previous.amount) !== requestedMinor
            || previous.type !== "DEBIT" || previous.reversalEntryId || previous.fulfilledBookingId) {
            throw new Error("Payment debit is already closed or belongs to a different operation");
          }
          return previous;
        }
      }
      if (lockWalletForDebit) await lockWalletForDebit(userOid, session);
      const balanceResult = await SMLedger.aggregate([
        {
          $match: {
            userId: userOid,
            direction: "CREDIT",
            status: "ACTIVE",
            remainingAmount: { $gt: 0 },
            expires_at: { $gt: now() },
          },
        },
        { $group: { _id: null, total: { $sum: "$remainingAmount" } } },
      ]).session(session);
      const available = balanceResult.length > 0 ? balanceResult[0].total : 0;
      if (toMinorUnits(available) < requestedMinor) {
        throw new Error(
          `Insufficient Shuvmarg Money. Available: Rs. ${Math.max(
            0,
            Math.round(available)
          )}, Required: Rs. ${amount}`
        );
      }
      const credits = await SMLedger.find({
        userId: userOid,
        direction: "CREDIT",
        status: "ACTIVE",
        remainingAmount: { $gt: 0 },
        expires_at: { $gt: now() },
      })
        .sort({ expires_at: 1 })
        .session(session);
      let remaining = requestedMinor;
      const consumed = [];
      for (const credit of credits) {
        if (remaining <= 0) break;
        const consumedMinor = Math.min(toMinorUnits(credit.remainingAmount), remaining);
        const consumedAmount = fromMinorUnits(consumedMinor);
        credit.remainingAmount = fromMinorUnits(toMinorUnits(credit.remainingAmount) - consumedMinor);
        if (credit.remainingAmount <= 0) {
          credit.remainingAmount = 0;
          credit.status = "USED";
        }
        await credit.save({ session });
        consumed.push({ creditEntryId: credit._id, amountConsumed: consumedAmount });
        remaining -= consumedMinor;
      }
      if (remaining !== 0) throw new Error("Ledger allocation requires reconciliation");
      const debitEntry = (
        await SMLedger.create(
          [
            {
              userId: userOid,
              operationKey, paymentContext,
              bookingId,
              type: "DEBIT",
              direction: "DEBIT",
              amount,
              status: "PROCESSED",
              expires_at: null,
              remainingAmount: null,
              note: note || `SM Money spent: Rs. ${amount}`,
              consumedBy: consumed.map((item) => ({
                debitLedgerEntryId: item.creditEntryId,
                amountConsumed: item.amountConsumed,
              })),
            },
          ],
          { session }
        )
      )[0];
      for (const item of consumed) {
        await SMLedger.updateOne(
          { _id: item.creditEntryId },
          {
            $push: {
              consumedBy: {
                debitLedgerEntryId: debitEntry._id,
                amountConsumed: item.amountConsumed,
              },
            },
          },
          { session }
        );
      }
      return debitEntry;
    });
  };
}

module.exports = { createSmLedgerFifoDebitService };
