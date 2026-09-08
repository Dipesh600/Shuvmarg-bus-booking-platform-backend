"use strict";
const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const fixture = require("../helpers/security-cancellation-fixtures");
const Trip = require("../../models/tripModel");
const { Booking, Seat, Refund } = fixture;
const { createTripCancellationService } = require("../../src/modules/admin/fleet-workstation/trip-cancellation.service");
const transitionPolicy = require("../../src/modules/admin/fleet-workstation/trip-transition.policy");
const { createBudgetedRefund } = require("../../src/shared/refund-budget");
const { withMongoTransaction } = require("../../src/shared/with-mongo-transaction");
let data; let fleetId; let adminId;
before(fixture.start); after(fixture.stop);
beforeEach(async () => {
  data = await fixture.seed(); fleetId = new mongoose.Types.ObjectId(); adminId = new mongoose.Types.ObjectId();
  await Trip.updateOne({ _id: data.tripId }, { $set: { busId: fleetId, ownerId: new mongoose.Types.ObjectId(),
    arrivalTime: "18:00", bookingClosesAt: new Date("2099-01-01"), shift: "day", status: "scheduled" } });
});
const operator = (clawbackCashback = fixture.ledgerService.clawbackCashback) => createTripCancellationService({
  mongoose, Booking, Trip, Seat, transitionPolicy, clawbackCashback });
const cancelTrip = service => service.cancelTrip({ tripId: data.tripId, fleetId, adminId, reason: "Operator cancellation" });

test("operator and passenger cancellations racing create one refund", async () => {
  const results = await Promise.allSettled([
    cancelTrip(operator()), fixture.build().cancelPassengerBooking("SEC-TICKET", data.userId, "Passenger cancellation", { refundMethod: "wallet" }),
  ]);
  assert.ok(results.some(r => r.status === "fulfilled"));
  assert.equal(await Refund.countDocuments({}), 1);
  assert.equal((await Booking.findById(data.booking._id)).status, "cancelled");
  assert.equal((await Seat.findOne({ tripId: data.tripId })).seata[0].booked, false);
  assert.equal((await Booking.findById(data.booking._id)).refundReservedMinor, 100000);
});

test("operator cancellation rolls back trip, seats, refunds and bookings on failure", async () => {
  await assert.rejects(() => cancelTrip(operator(async () => { throw new Error("clawback unavailable"); })), /clawback unavailable/);
  assert.equal((await Trip.findById(data.tripId)).status, "scheduled");
  assert.equal((await Booking.findById(data.booking._id)).status, "booked");
  assert.equal((await Seat.findOne({ tripId: data.tripId })).seata[0].booked, true);
  assert.equal(await Refund.countDocuments({}), 0);
  await cancelTrip(operator());
  await cancelTrip(operator());
  assert.equal(await Refund.countDocuments({}), 1);
});

test("concurrent partial refund reservations cannot exceed the payment", async () => {
  const outcomes = await Promise.allSettled(Array.from({ length: 20 }, (_, i) =>
    withMongoTransaction(mongoose, null, session => createBudgetedRefund({ userId: data.userId,
      bookingId: data.booking._id, originalAmount: 1000, refundAmount: 100,
      operationKey: `partial:${i}`, reason: "Partial refund", status: "pending" }, session))));
  assert.equal(outcomes.filter(r => r.status === "fulfilled").length, 10);
  assert.equal(await Refund.countDocuments({}), 10);
  assert.equal((await Booking.findById(data.booking._id)).refundReservedMinor, 100000);
});

test("existing legacy refunds consume the budget and failures leave it unchanged", async () => {
  await Refund.create({ userId: data.userId, bookingId: data.booking._id,
    originalAmount: 1000, refundAmount: 900, reason: "Historical refund", status: "completed" });
  await assert.rejects(() => withMongoTransaction(mongoose, null, session => createBudgetedRefund({
    userId: data.userId, bookingId: data.booking._id, originalAmount: 1000,
    refundAmount: 200, reason: "Another refund" }, session)), /exceeds/);
  assert.equal(await Refund.countDocuments({}), 1);
  assert.equal((await Booking.findById(data.booking._id)).refundReservedMinor, null);
});
