"use strict";
const mongoose = require("mongoose");
const crypto = require("node:crypto");
const Attempt = require("../../../../models/esewaPaymentAttemptModel");
const ledger = require("../../wallet/sm-ledger");
const { withMongoTransaction } = require("../../../shared/with-mongo-transaction");

function checkoutFingerprint(body) {
  const normalize = value => Array.isArray(value) ? value.map(normalize)
    : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(k => [k, normalize(value[k])])) : value;
  const allowed = ["couponCode", "smMoneyToUse", "boardingPoint", "droppingPoint", "passengerDetails"];
  return crypto.createHash("sha256").update(JSON.stringify(normalize(Object.fromEntries(allowed.map(k => [k, body[k] ?? null]))))).digest("hex");
}

async function createReservedAttempt(payload) {
  return withMongoTransaction(mongoose, null, async session => {
    const [attempt] = await Attempt.create([payload], { session });
    if (attempt.smMoneyApplied > 0) {
      if (!payload.walletAuthorizedAt) throw new Error("Wallet authorization is required before reserving SM Money");
      const debit = await ledger.debitLedgerFIFO({ userId: attempt.userId, amount: attempt.smMoneyApplied,
        operationKey: `checkout:${attempt.tempBookingId}`, session,
        paymentContext: { tempBookingId: attempt.tempBookingId, holdId: attempt.holdId,
          gateway: "esewa", transactionUuid: attempt.transactionUuid },
        note: `SM Money reserved for checkout ${attempt.tempBookingId}` });
      attempt.reservedLedgerEntryId = debit._id;
      await attempt.save({ session });
    }
    return attempt;
  });
}

module.exports = { checkoutFingerprint, createReservedAttempt };
