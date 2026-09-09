'use strict';
const mongoose = require('mongoose');
const Attempt = require('../models/esewaPaymentAttemptModel');
const Transaction = require('../models/transactionModel');
const Booking = require('../models/bookTicketModel');
const User = require('../models/userModel');
const { withMongoTransaction } = require('../src/shared/with-mongo-transaction');
const { assertEsewaAttemptEnvironment } = require('../src/shared/esewa-environment');
const { readEsewaCheckoutConfig } = require('../src/modules/booking/passenger-esewa-checkout/passenger-esewa-checkout.config');
const { verifyEsewaPayment } = require('./esewaVerificationService');
const ledger = require('../src/modules/wallet/sm-ledger');
const logger = require('../utils/logger');
const { enqueueRecoveredPaymentRefund } = require('../src/modules/notifications/outbox/booking-sms.service');

// Status enquiry only. A refund initiation API is not documented for ePay V2.
// Never infer payout completion from a local request or a browser callback.
async function confirmPaymentRefund(attempt, { verifyPayment = verifyEsewaPayment,
  readConfig = readEsewaCheckoutConfig } = {}) {
  assertEsewaAttemptEnvironment(attempt, readConfig());
  const verification = await verifyPayment(attempt.transactionUuid, attempt.gatewayAmount);
  if (!verification?.identityVerified || verification.status !== 'FULL_REFUND') return false;
  return withMongoTransaction(mongoose, null, async session => {
    const current = await Attempt.findOneAndUpdate({ _id: attempt._id, status: 'DISPUTED',
      refundRequiredAt: { $ne: null }, verificationStatus: { $ne: 'FULL_REFUND' } },
    { $set: { verificationStatus: 'FULL_REFUND' } }, { session, new: true });
    if (!current) return false;
    if (await Booking.exists({ transactionId: current.transactionUuid, userId: current.userId }).session(session)) {
      throw new Error('A booking exists for a refunded payment; review is required');
    }
    const transaction = await Transaction.findOne({ _id: current.transactionRecordId,
      transactionId: current.transactionUuid, userId: current.userId }).session(session);
    if (!transaction || !['DISPUTED', 'REFUNDED'].includes(transaction.status)) throw new Error('Refund transaction requires review');
    if (current.reservedLedgerEntryId) await ledger.reverseDebit(current.reservedLedgerEntryId, { session });
    transaction.status = 'REFUNDED'; transaction.refundStatus = 'COMPLETED';
    transaction.resolvedAt ||= new Date();
    transaction.meta = { ...transaction.meta, providerRefundConfirmation: {
      status: 'FULL_REFUND', verifiedAt: new Date(), gatewayAmount: current.gatewayAmount,
      reference: verification.esewaData?.ref_id ?? verification.esewaData?.refId ?? null,
    } };
    await transaction.save({ session });
    current.result = { statusCode: 410, body: { success: false, errorCode: 'PAYMENT_CLOSED',
      message: 'The payment has been refunded to its original sources.', caseId: transaction._id } };
    await current.save({ session });
    const user = await User.findById(current.userId).select('phone').session(session).lean();
    if (user?.phone) await enqueueRecoveredPaymentRefund({ attempt: current, transaction, phone: user.phone }, { session });
    return true;
  });
}

async function recoverPaymentRefunds() {
  const attempts = await Attempt.find({ status: 'DISPUTED', refundRequiredAt: { $ne: null },
    verificationStatus: { $ne: 'FULL_REFUND' },
    $or: [{ refundCheckedAt: null }, { refundCheckedAt: { $lte: new Date(Date.now() - 5 * 60000) } }],
  }).sort({ refundCheckedAt: 1, refundRequiredAt: 1 }).limit(25);
  for (const attempt of attempts) {
    try {
      await Attempt.updateOne({ _id: attempt._id }, { $set: { refundCheckedAt: new Date() } });
      await confirmPaymentRefund(attempt);
    } catch (error) { logger.error('Payment refund status requires retry', { attemptId: attempt._id, error: error.message }); }
  }
}
module.exports = { confirmPaymentRefund, recoverPaymentRefunds };
