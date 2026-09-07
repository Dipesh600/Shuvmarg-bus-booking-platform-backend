'use strict';
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const fixture = require('../helpers/security-cancellation-fixtures');
const Hold = require('../../models/seatHoldModel');
const Transaction = require('../../models/transactionModel');
const Trip = require('../../models/tripModel');
const { commitPaymentBooking } = require('../../src/shared/commit-payment-booking');
let data, hold, payload;
before(async () => { await fixture.start(); await Promise.all([Hold.init(), Transaction.init()]); });
after(fixture.stop);
beforeEach(async () => {
  data = await fixture.seed();
  await fixture.Booking.deleteMany({}); await Hold.deleteMany({}); await Transaction.deleteMany({});
  await Trip.updateOne({ _id: data.tripId }, { $set: { status: 'scheduled' } });
  await fixture.Seat.updateOne({ tripId: data.tripId }, { $set: { 'seata.0.booked': false, 'seata.0.bookedBy': null } });
  hold = await Hold.create({ tripId: data.tripId, userId: data.userId, tempBookingId: 'atomic-hold',
    seatNumbers: ['a1'], seatKeys: ['atomic-seat'], userTripKey: 'atomic-user-trip',
    status: 'processing', expiresAt: new Date(Date.now() + 60000) });
  payload = { userId: data.userId, tripId: data.tripId, ticketId: 'ATOMIC-TICKET', seats: ['A1'],
    totalAmount: 1000, originalAmount: 1000, gatewayAmount: 1000, paymentMethod: 'ESEWA', transactionId: 'atomic-payment' };
  await Transaction.create({ userId: data.userId, tripId: data.tripId, transactionId: payload.transactionId,
    gateway: 'esewa', transactionType: 'BOOKING', totalAmount: 1000, status: 'PAYMENT_RECEIVED' });
});
const commit = () => commitPaymentBooking(payload, { holdId: hold._id });
const seat = async () => (await fixture.Seat.findOne({ tripId: data.tripId })).seata[0];
test('seat, hold, transaction and booking commit together and retries reuse the booking', async () => {
  const results = await Promise.all(Array.from({ length: 8 }, commit));
  assert.equal(new Set(results.map(row => String(row._id))).size, 1);
  assert.equal(await fixture.Booking.countDocuments({}), 1);
  assert.equal((await seat()).booked, true);
  const savedHold = await Hold.findById(hold._id).select('+seatKeys +userTripKey');
  assert.equal(savedHold.status, 'completed');
  assert.equal(savedHold.userTripKey, undefined);
  assert.equal(savedHold.seatKeys, undefined);
  assert.equal((await Transaction.findOne()).status, 'SUCCESS');
});
test('failure after inventory updates rolls back every write', async () => {
  const create = fixture.Booking.create;
  fixture.Booking.create = async () => { throw new Error('Injected booking persistence failure'); };
  try { await assert.rejects(commit, /Injected/); } finally { fixture.Booking.create = create; }
  assert.equal((await seat()).booked, false);
  assert.equal((await Hold.findById(hold._id)).status, 'processing');
  assert.equal((await Transaction.findOne()).status, 'PAYMENT_RECEIVED');
  assert.equal(await fixture.Booking.countDocuments({}), 0);
  await commit();
  assert.equal((await seat()).booked, true);
});
test('expired or differently owned holds and conflicting seats fail without partial booking', async () => {
  await Hold.updateOne({ _id: hold._id }, { $set: { userId: new mongoose.Types.ObjectId() } });
  await assert.rejects(commit, /hold/);
  await Hold.updateOne({ _id: hold._id }, { $set: { userId: data.userId, expiresAt: new Date(0) } });
  await assert.rejects(commit, /hold/);
  await Hold.updateOne({ _id: hold._id }, { $set: { expiresAt: new Date(Date.now() + 60000) } });
  await fixture.Seat.updateOne({ tripId: data.tripId }, { $set: { 'seata.0.booked': true } });
  await assert.rejects(commit, /seat/);
  assert.equal(await fixture.Booking.countDocuments({}), 0);
  assert.equal((await Transaction.findOne()).status, 'PAYMENT_RECEIVED');
});
