'use strict';
const mongoose = require('mongoose');
const Attempt = require('../../models/esewaPaymentAttemptModel');
const Hold = require('../../models/seatHoldModel');
const Booking = require('../../models/bookTicketModel');
const { withMongoTransaction } = require('./with-mongo-transaction');

// A new attempt owner may resume its interrupted hold, but cannot revive an
// expired/released hold or touch a booking already committed by another worker.
async function preparePaymentRetry(attempt) {
  return withMongoTransaction(mongoose, null, async session => {
    const current = await Attempt.findOneAndUpdate({ _id: attempt._id,
      userId: attempt.userId, status: 'VERIFYING', processingToken: attempt.processingToken,
      processingExpiresAt: { $gt: new Date() } }, { $inc: { recoverySequence: 1 } }, { session, new: true });
    if (!current) throw Object.assign(new Error('Payment processing ownership changed'), { code: 'PAYMENT_LEASE_LOST' });
    if (await Booking.exists({ transactionId: current.transactionUuid, userId: current.userId }).session(session)) {
      throw new Error('Booking already exists; recover its result before retrying');
    }
    await Hold.updateOne({ _id: current.holdId, userId: current.userId,
      tempBookingId: current.tempBookingId, status: 'processing', expiresAt: { $gt: new Date() } },
    { $set: { status: 'held' }, $unset: { processingAt: '', heldExpiresAt: '' } }, { session });
  });
}
module.exports = { preparePaymentRetry };
