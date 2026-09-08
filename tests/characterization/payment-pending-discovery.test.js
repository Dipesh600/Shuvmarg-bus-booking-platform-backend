'use strict';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { mongoose } = require('../helpers/payment-reversal-harness');
const Attempt = require('../../models/esewaPaymentAttemptModel');
const { createPendingCheckoutController } = require('../../src/modules/booking/passenger-esewa-checkout/passenger-esewa-pending.controller');
beforeEach(async () => { await Attempt.deleteMany({}); });
test('pending discovery is owner scoped and returns no signed forms or wallet authorization', async () => {
  const owner = new mongoose.Types.ObjectId();
  const other = new mongoose.Types.ObjectId();
  await Attempt.collection.insertMany([
    { userId: owner, transactionUuid: 'pending-own', tempBookingId: 'hold1', status: 'INITIATED', formFields: { signature: 'secret' }, walletAuthorizedAt: new Date() },
    { userId: other, transactionUuid: 'pending-other', tempBookingId: 'hold2', status: 'VERIFYING' },
    { userId: owner, transactionUuid: 'closed-own', tempBookingId: 'hold3', status: 'FAILED' },
  ]);
  let body;
  const res = { status(code) { assert.equal(code, 200); return this; }, json(value) { body = value; } };
  await createPendingCheckoutController({ Attempt })({ dbUser: { _id: owner } }, res, error => { throw error; });
  assert.deepEqual(body.data.attempts, [{ transactionUuid: 'pending-own', status: 'INITIATED' }]);
});
