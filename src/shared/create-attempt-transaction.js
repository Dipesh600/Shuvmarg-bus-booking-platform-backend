'use strict';
const mongoose = require('mongoose');
const Attempt = require('../../models/esewaPaymentAttemptModel');
const Transaction = require('../../models/transactionModel');
const { withMongoTransaction } = require('./with-mongo-transaction');
const { toMinorUnits } = require('./money');
async function createAttemptTransaction(payload, { attemptId, processingToken } = {}) {
  if (!attemptId) return Transaction.create(payload);
  return withMongoTransaction(mongoose, null, async session => {
    // Serialize with booking commit, compensation, and newer worker claims.
    const attempt = await Attempt.findOneAndUpdate({ _id: attemptId, userId: payload.userId,
      transactionUuid: payload.transactionId, status: 'VERIFYING', processingToken,
      processingExpiresAt: { $gt: new Date() } }, { $set: { updatedAt: new Date() } }, { session, new: true });
    if (!attempt) throw Object.assign(new Error('Payment processing ownership changed'), { code: 'PAYMENT_LEASE_LOST' });
    if (toMinorUnits(attempt.finalAmount) !== toMinorUnits(payload.totalAmount)) throw new Error('Payment amount changed');
    const existing = await Transaction.findOne({ transactionId: payload.transactionId, userId: payload.userId }).session(session);
    if (existing) {
      if (toMinorUnits(existing.totalAmount) !== toMinorUnits(payload.totalAmount) || String(existing.tripId) !== String(payload.tripId)) {
        throw new Error('Existing payment transaction requires reconciliation');
      }
      return existing;
    }
    const [transaction] = await Transaction.create([payload], { session });
    return transaction;
  });
}
module.exports = { createAttemptTransaction };
