'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../helpers/db');
const EsewaPaymentAttempt = require(
  '../../models/esewaPaymentAttemptModel'
);
const SeatHold = require('../../models/seatHoldModel');
const Transaction = require('../../models/transactionModel');
const {
  createPassengerEsewaCheckoutRepository,
} = require(
  '../../src/modules/booking/passenger-esewa-checkout/passenger-esewa-checkout.repository'
);

const userId = '507f1f77bcf86cd799439012';
const holdId = '507f1f77bcf86cd799439013';

function payload(transactionUuid = 'SM-CONCURRENT-1') {
  return {
    userId,
    holdId,
    tempBookingId: 'TEMP-CONCURRENT-1',
    transactionUuid,
    productCode: 'EPAYTEST',
    originalAmount: 100,
    gatewayAmount: 100,
    finalAmount: 100,
    confirmationQuote: { gatewayAmount: 100, finalAmount: 100 },
    checkoutPayload: { scheduleId: 'trip-1', seatNumbers: ['a1'] },
    formFields: { total_amount: '100' },
    holdExpiresAt: new Date(Date.now() + 60_000),
  };
}

test('eSewa attempt database concurrency is idempotent', async (t) => {
  const repository = createPassengerEsewaCheckoutRepository({
    EsewaPaymentAttempt,
    SeatHold,
    Transaction,
  });
  t.before(async () => {
    await db.connect();
    await EsewaPaymentAttempt.syncIndexes();
  });
  t.after(async () => db.disconnect());
  t.beforeEach(async () => db.clearAll());

  await t.test('parallel initiation creates one attempt per hold', async () => {
    const [first, second] = await Promise.all([
      repository.createAttempt(payload('SM-CONCURRENT-1')),
      repository.createAttempt(payload('SM-CONCURRENT-2')),
    ]);
    assert.equal(String(first._id), String(second._id));
    assert.equal(await EsewaPaymentAttempt.countDocuments(), 1);
  });

  await t.test('parallel finalization claims allow one worker', async () => {
    const attempt = await repository.createAttempt(payload());
    const [first, second] = await Promise.all([
      repository.claimOwnedAttempt(attempt.transactionUuid, userId, 90_000),
      repository.claimOwnedAttempt(attempt.transactionUuid, userId, 90_000),
    ]);
    assert.equal([first, second].filter(Boolean).length, 1);
  });

  await t.test('expired verification lease can be reclaimed once', async () => {
    const attempt = await repository.createAttempt(payload());
    await EsewaPaymentAttempt.updateOne(
      { _id: attempt._id },
      {
        $set: {
          status: 'VERIFYING',
          processingExpiresAt: new Date(Date.now() - 1000),
        },
      }
    );
    const reclaimed = await repository.claimOwnedAttempt(
      attempt.transactionUuid,
      userId,
      90_000
    );
    assert.equal(reclaimed.status, 'VERIFYING');
    assert.ok(reclaimed.processingExpiresAt > new Date());
  });
});
