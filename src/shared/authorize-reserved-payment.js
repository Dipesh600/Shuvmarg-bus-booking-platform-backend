"use strict";
const Attempt = require("../../models/esewaPaymentAttemptModel");
const Ledger = require("../../models/smLedgerModel");
const Wallet = require("../../models/walletModel");
const { toMinorUnits } = require("./money");

async function authorizeReservedPayment({ attemptId, processingToken, userId, amount }) {
  const attempt = await Attempt.findOne({ _id: attemptId, userId, processingToken, status: "VERIFYING",
    processingExpiresAt: { $gt: new Date() } });
  const wallet = await Wallet.findOne({ userId, status: "active" });
  if (!attempt?.walletAuthorizedAt || !wallet || toMinorUnits(attempt.smMoneyApplied) !== toMinorUnits(amount)) {
    throw new Error("Reserved wallet payment authorization is no longer valid");
  }
  const debit = await Ledger.findById(attempt.reservedLedgerEntryId);
  if (!debit || String(debit.userId) !== String(userId) || debit.type !== "DEBIT"
    || debit.reversalEntryId || debit.fulfilledBookingId || toMinorUnits(debit.amount) !== toMinorUnits(amount)) {
    throw new Error("Reserved wallet payment requires reconciliation");
  }
  return { ok: true, debitEntryId: debit._id };
}

module.exports = { authorizeReservedPayment };
