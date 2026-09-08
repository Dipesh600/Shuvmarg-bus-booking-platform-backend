'use strict';
const { test, before, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const fixture = require('../helpers/security-cancellation-fixtures');
const refundCalculator = require('../../services/refundCalculatorService');
const { Booking, Seat, Refund, Wallet, Ledger } = fixture;
let data;
before(async () => {
  await fixture.start();
  mock.method(refundCalculator, 'calculateRefund', async () => ({ eligible: true,
    refundAmount: 800, cancellationCharge: 200, refundPercentage: 80 }));
  mock.method(fixture.PlatformConfig, 'getConfig', async () => ({ creditExpiryMonths: 12 }));
});
beforeEach(async () => { data = await fixture.seed(); });
after(async () => { mock.restoreAll(); await fixture.stop(); });
const cancel = service => service.cancelPassengerBooking('SEC-TICKET', data.userId, 'Changed plans', { refundMethod: 'wallet' });

async function assertCommitted() {
  assert.equal(await Refund.countDocuments({ bookingId: data.booking._id }), 1);
  assert.equal(await Ledger.countDocuments({ type: 'REFUND' }), 1);
  assert.equal(await Ledger.countDocuments({ type: 'CASHBACK_CLAWBACK' }), 1);
  assert.equal((await Wallet.findOne({ userId: data.userId })).balance, 800);
  assert.equal((await Booking.findById(data.booking._id)).status, 'cancelled');
  assert.equal((await Seat.findOne({ tripId: data.tripId })).seata[0].booked, false);
}
async function assertRolledBack() {
  assert.equal(await Refund.countDocuments({}), 0);
  assert.equal(await Ledger.countDocuments({ type: 'REFUND' }), 0);
  assert.equal(await Ledger.countDocuments({ type: 'CASHBACK_CLAWBACK' }), 0);
  assert.equal((await Ledger.findOne({ type: 'CASHBACK' })).status, 'ACTIVE');
  assert.equal((await Wallet.findOne({ userId: data.userId })).balance, 0);
  assert.equal((await Booking.findById(data.booking._id)).status, 'booked');
  assert.equal((await Seat.findOne({ tripId: data.tripId })).seata[0].booked, true);
}

test('twenty simultaneous cancellations commit one refund and one wallet credit', async () => {
  let notifications = 0;
  const service = fixture.build({ notify: async () => {
    await assertCommitted(); notifications++;
  } });
  const results = await Promise.allSettled(Array.from({ length: 20 }, () => cancel(service)));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  for (const result of results.filter(result => result.status === 'rejected')) {
    assert.ok([400, 409].includes(result.reason.statusCode), result.reason.stack);
  }
  await assertCommitted();
  assert.equal(notifications, 1);
  await assert.rejects(() => cancel(service), error => error.statusCode === 400);
  await assertCommitted();
});

for (const stage of ['claimBooking', 'saveSeat', 'clawback', 'credit', 'createRefund', 'saveBooking']) {
  test(`failure after ${stage} rolls everything back; retry commits once`, async () => {
    const repository = fixture.createPassengerBookingCancellationRepository();
    const options = { repository, notify: async () => assert.fail('notification before commit') };
    const failAfter = operation => async (...args) => { await operation(...args); throw new Error(`injected ${stage}`); };
    if (stage === 'credit') options.credit = failAfter(fixture.walletService.creditWallet);
    else if (stage === 'clawback') options.clawback = failAfter(fixture.ledgerService.clawbackCashback);
    else repository[stage] = failAfter(repository[stage]);
    await assert.rejects(() => cancel(fixture.build(options)), new RegExp(`injected ${stage}`));
    await assertRolledBack();
    await cancel(fixture.build());
    await assertCommitted();
  });
}

test('another account cannot claim the booking or move money', async () => {
  await assert.rejects(() => fixture.build().cancelPassengerBooking('SEC-TICKET', 'other'),
    error => error.statusCode === 403);
  await assertRolledBack();
});
