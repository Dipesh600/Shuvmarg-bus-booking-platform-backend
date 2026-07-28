"use strict";

function createSmLedgerFifoDebitService({
  mongoose,
  SMLedger,
  toObjectId,
  now = () => new Date(),
}) {
  return async function debitLedgerFIFO({
    userId,
    amount,
    bookingId = null,
    note = null,
  }) {
    if (amount <= 0) throw new Error("Debit amount must be greater than zero");
    const userOid = toObjectId(userId);
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
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
      if (available < amount) {
        await session.abortTransaction();
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
      let remaining = amount;
      const consumed = [];
      for (const credit of credits) {
        if (remaining <= 0) break;
        const consumedAmount = Math.min(credit.remainingAmount, remaining);
        credit.remainingAmount -= consumedAmount;
        if (credit.remainingAmount <= 0) {
          credit.remainingAmount = 0;
          credit.status = "USED";
        }
        await credit.save({ session });
        consumed.push({ creditEntryId: credit._id, amountConsumed: consumedAmount });
        remaining -= consumedAmount;
      }
      const debitEntry = (
        await SMLedger.create(
          [
            {
              userId: userOid,
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
      await session.commitTransaction();
      return debitEntry;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  };
}

module.exports = { createSmLedgerFifoDebitService };
