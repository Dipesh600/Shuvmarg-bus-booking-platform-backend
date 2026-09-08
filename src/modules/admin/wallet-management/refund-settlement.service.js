"use strict";
const mongoose = require("mongoose");
const Refund = require("../../../../models/refundModel");
const Booking = require("../../../../models/bookTicketModel");
const { withMongoTransaction } = require("../../../shared/with-mongo-transaction");
const { toMinorUnits } = require("../../../shared/money");
const { allocateRefund } = require("../../../shared/refund-allocation");
const { recordManualSettlement, fail } = require("../../../shared/refund-settlement-evidence");
const wallet = require("../../../../services/walletService");
const { sourceBudget } = require("../../../shared/refund-source-budget");

async function updateRefund({ refundId, adminId, status, remarks, refundGateway, refundGatewayId, proofKey }) {
  if (!mongoose.isValidObjectId(refundId) || !mongoose.isValidObjectId(adminId)) throw fail("Valid refund and administrator IDs are required");
  if (!["processing", "completed", "rejected"].includes(status)) throw fail("Invalid refund status");
  if (remarks !== undefined && (typeof remarks !== "string" || remarks.length > 2000)) throw fail("Invalid refund remarks");
  return withMongoTransaction(mongoose, null, async session => {
    const refund = await Refund.findById(refundId).session(session);
    if (!refund) throw Object.assign(new Error("Refund not found"), { statusCode: 404 });
    if (refund.status === "completed" && status === "completed") return { refund, changed: false };
    if (!["pending", "processing"].includes(refund.status)) throw fail("This refund is already closed");
    const booking = await Booking.findById(refund.bookingId).session(session);
    if (!booking || String(booking.userId) !== String(refund.userId)) throw fail("Refund ownership requires reconciliation");
    if (booking.cancelledBy === "admin" && refund.destination === null && refund.refundAmount > 0) {
      throw fail("Wait for the passenger to select a refund destination");
    }
    const amountMinor = toMinorUnits(refund.refundAmount);
    const siblings = await Refund.find({ bookingId: booking._id, status: { $nin: ["rejected", "not_applicable"] } }).session(session);
    sourceBudget(booking.toObject(), siblings);
    if (siblings.reduce((sum, r) => sum + toMinorUnits(r.refundAmount), 0) > toMinorUnits(booking.totalAmount)) {
      throw fail("Refund history exceeds the payment and requires reconciliation");
    }
    const method = refund.destination === "wallet" || booking.paymentMethod === "SM_WALLET"
      ? "yatra_balance" : refundGateway || refund.refundGateway;
    const expectedMethod = { ESEWA: "esewa", SM_WALLET_SPLIT: "esewa", KHALTI: "khalti", CASH: "cash", AGENT: "cash" }[booking.paymentMethod];
    if (refund.destination === "original" && expectedMethod && method && method !== expectedMethod) {
      throw fail("Refund method must match the recorded original payment destination");
    }
    const allocation = refund.paymentAllocation || allocateRefund({ ...booking.toObject(), refundAmount: refund.refundAmount });
    const smAmount = method === "yatra_balance" ? refund.refundAmount : allocation.smRefundAmount;
    const externalAmount = method === "yatra_balance" ? 0 : allocation.gatewayRefundAmount;
    if ((proofKey || status === "completed") && (smAmount === undefined || externalAmount === undefined)) {
      throw fail("Payment allocation requires reconciliation before settlement");
    }
    if ((proofKey || status === "completed") &&
      toMinorUnits(smAmount) + toMinorUnits(externalAmount) !== amountMinor) {
      throw fail("Refund allocation does not match the approved refund amount");
    }
    if (proofKey) {
      if (status !== "processing" || !["esewa", "khalti", "bank_transfer", "cash", "other"].includes(method)) throw fail("Save external payout proof while processing");
      if (typeof refundGatewayId !== "string" || !refundGatewayId.trim() || refundGatewayId.length > 200) throw fail("A payout reference is required");
      refund.settlementEvidence = { kind: "manual", method, reference: refundGatewayId.trim(), proofKey,
        amountMinor: toMinorUnits(externalAmount, { allowZero: false }), submittedBy: String(adminId), submittedAt: new Date() };
      refund.refundProof = proofKey;
      refund.refundGateway = method;
      refund.refundGatewayId = refundGatewayId.trim();
    }
    if (status === "completed") {
      if (externalAmount > 0) {
        if (refund.settlementEvidence?.method !== method) throw fail("Payout method differs from submitted proof");
        refund.settlementEvidence = await recordManualSettlement({ caseId: `refund:${refund._id}`, amount: externalAmount,
          evidence: refund.settlementEvidence, adminId, session });
      }
      if (smAmount > 0) {
        const credit = await wallet.creditWallet({ userId: refund.userId, amount: smAmount, purpose: "refund",
          referenceType: "refund", referenceId: booking._id, remarks: `Refund ${refund._id}`, session });
        refund.settlementEvidence = { ...refund.settlementEvidence, ledgerEntryId: credit.ledgerEntry._id };
      }
      refund.completedAt = new Date();
      refund.refundGateway = method;
      refund.refundGatewayId = refund.settlementEvidence?.reference || String(refund.settlementEvidence?.ledgerEntryId || "");
    }
    if (status === "rejected" && (typeof remarks !== "string" || remarks.trim().length < 10)) throw fail("Explain the refund rejection in at least 10 characters");
    if (status === "rejected") {
      if (refund.settlementEvidence?.proofKey || refund.refundProof || refund.refundGatewayId) {
        throw fail("A refund with payout evidence cannot be rejected; reconcile the transfer first");
      }
      await Booking.updateOne({ _id: booking._id }, { $set: { refundReservedMinor:
        siblings.filter(row => String(row._id) !== String(refund._id))
          .reduce((sum, row) => sum + toMinorUnits(row.refundAmount), 0) } }, { session });
    }
    refund.status = amountMinor === 0 && status === "completed" ? "not_applicable" : status;
    refund.processedBy = adminId;
    refund.processedAt ||= new Date();
    if (remarks) refund.remarks = remarks.trim();
    await refund.save({ session });
    return { refund, changed: true };
  });
}

module.exports = { updateRefund };
