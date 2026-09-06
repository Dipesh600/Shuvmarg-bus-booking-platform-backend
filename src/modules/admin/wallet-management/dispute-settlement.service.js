"use strict";
const mongoose = require("mongoose");
const Transaction = require("../../../../models/transactionModel");
const Booking = require("../../../../models/bookTicketModel");
const SMLedger = require("../../../../models/smLedgerModel");
const ledger = require("../../wallet/sm-ledger");
const { withMongoTransaction } = require("../../../shared/with-mongo-transaction");
const { toMinorUnits } = require("../../../shared/money");
const { recordManualSettlement, fail } = require("../../../shared/refund-settlement-evidence");

async function settleDispute({ transactionId, adminId, refundStatus, refundNote, refundReference, proofKey }) {
  return withMongoTransaction(mongoose, null, async session => {
    const transaction = await Transaction.findById(transactionId).session(session);
    if (!transaction) throw Object.assign(new Error("Transaction not found"), { statusCode: 404 });
    if (transaction.status === "REFUNDED" && refundStatus === "COMPLETED") return transaction;
    if (transaction.status !== "DISPUTED") throw fail("Only disputed payments can be settled");
    const booking = await Booking.exists({ transactionId: transaction.transactionId, userId: transaction.userId }).session(session);
    if (booking || transaction.bookingId) throw fail("A booking exists; use its cancellation refund instead");
    const smAmount = transaction.meta?.smMoneyUsed || 0;
    const gatewayAmount = transaction.meta?.gatewayAmount ?? transaction.totalAmount;
    if (toMinorUnits(smAmount) + toMinorUnits(gatewayAmount) !== toMinorUnits(transaction.totalAmount)) {
      throw fail("Payment allocation requires reconciliation");
    }
    let evidence = transaction.meta?.refundEvidence;
    if (proofKey) {
      if (refundStatus !== "PENDING" || typeof refundReference !== "string" || !refundReference.trim() || refundReference.length > 200) {
        throw fail("Save payout proof with a reference as PENDING before independent review");
      }
      evidence = { kind: "manual", method: transaction.gateway, reference: refundReference.trim(), proofKey,
        amountMinor: toMinorUnits(gatewayAmount, { allowZero: false }), submittedBy: String(adminId), submittedAt: new Date() };
      transaction.proofAttachmentKey = proofKey;
    }
    if (refundStatus === "COMPLETED") {
      if (gatewayAmount > 0) evidence = await recordManualSettlement({ caseId: `dispute:${transaction._id}`,
        amount: gatewayAmount, evidence, adminId, session });
      if (smAmount > 0) {
        const debit = await SMLedger.findById(transaction.meta?.smDebitEntryId).session(session);
        if (!debit || String(debit.userId) !== String(transaction.userId) || toMinorUnits(debit.amount) !== toMinorUnits(smAmount)) {
          throw fail("The original SM debit requires reconciliation");
        }
        const reversal = await ledger.reverseDebit(debit._id, { session });
        evidence = { ...evidence, ledgerEntryId: reversal._id };
      }
    }
    transaction.status = refundStatus === "COMPLETED" ? "REFUNDED" : "DISPUTED";
    transaction.refundStatus = refundStatus;
    transaction.refundNote = refundNote;
    transaction.resolvedAt = refundStatus === "COMPLETED" ? new Date() : null;
    transaction.resolvedBy = refundStatus === "COMPLETED" ? adminId : null;
    transaction.meta = { ...transaction.meta, refundEvidence: evidence || null };
    await transaction.save({ session });
    return transaction;
  });
}

module.exports = { settleDispute };
