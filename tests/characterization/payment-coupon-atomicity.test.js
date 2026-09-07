"use strict";
const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const fixture = require("../helpers/security-cancellation-fixtures");
const Coupon = require("../../models/couponModel");
const Usage = require("../../models/couponUsageModel");
const { applyBookedCoupon, refundBookedCoupon } = require("../../src/shared/booking-coupon-operations");
const { recordBookingCoupon } = require("../../src/shared/record-booking-coupon");
const { withMongoTransaction } = require("../../src/shared/with-mongo-transaction");
let data, coupon;
before(async () => { await fixture.start(); await Promise.all([Coupon.init(), Usage.init()]); });
after(fixture.stop);
beforeEach(async () => {
  data = await fixture.seed(); await Coupon.deleteMany({}); await Usage.deleteMany({});
  coupon = await Coupon.create({ couponCode: "SAFE10", title: "Test coupon", discountType: "fixed",
    discountValue: 10, createdBy: data.userId, applicableUserTypes: ["passenger"], validFrom: new Date(0), validTo: new Date("2099-01-01"), totalUsageLimit: 1 });
  data.booking.couponUsed = coupon._id; data.booking.couponCode = coupon.couponCode;
  data.booking.discountAmount = 10; data.booking.totalAmount = 990; await data.booking.save();
});
const apply = () => applyBookedCoupon(coupon.couponCode, data.userId, data.booking._id, 1000);
test("replayed coupon usage increments its counter exactly once", async () => {
  await Promise.all(Array.from({ length: 8 }, apply));
  assert.equal(await Usage.countDocuments({}), 1);
  assert.equal((await Coupon.findById(coupon._id)).usedCount, 1);
});
test("overlapping distinct bookings cannot exceed global or per-user limits", async () => {
  const other = await fixture.Booking.create({ ...data.booking.toObject(), _id: new mongoose.Types.ObjectId(), ticketId: "OTHER" });
  const results = await Promise.allSettled([apply(), applyBookedCoupon(coupon.couponCode, data.userId, other._id, 1000)]);
  assert.equal(results.filter(row => row.status === "fulfilled").length, 1);
  assert.equal(await Usage.countDocuments({}), 1);
  assert.equal((await Coupon.findById(coupon._id)).usedCount, 1);
});
test("usage and counter roll back with a failed booking transaction", async () => {
  await assert.rejects(() => withMongoTransaction(mongoose, null, async session => {
    await recordBookingCoupon(data.booking, session); throw new Error("injected booking failure");
  }), /injected/);
  assert.equal(await Usage.countDocuments({}), 0);
  assert.equal((await Coupon.findById(coupon._id)).usedCount, 0);
});
test("coupon refunds require cancellation and repeated refunds cannot decrement twice", async () => {
  await apply(); await assert.rejects(() => refundBookedCoupon(data.booking._id), /cancelled/);
  await fixture.Booking.updateOne({ _id: data.booking._id }, { $set: { status: "cancelled" } });
  await Promise.all(Array.from({ length: 6 }, () => refundBookedCoupon(data.booking._id)));
  assert.equal((await Coupon.findById(coupon._id)).usedCount, 0);
  assert.equal((await Usage.findOne()).status, "refunded");
  await assert.rejects(apply, /active owned/);
});
test("replay retains the booked discount after configuration changes", async () => {
  await apply(); await Coupon.updateOne({ _id: coupon._id }, { $set: { discountValue: 20, isActive: false } });
  assert.equal((await apply()).discountAmount, 10);
  assert.equal((await Coupon.findById(coupon._id)).usedCount, 1);
});
test("changed discount before first commit fails without a partial usage", async () => {
  await Coupon.updateOne({ _id: coupon._id }, { $set: { discountValue: 20 } });
  await assert.rejects(apply, /terms changed/);
  assert.equal(await Usage.countDocuments({}), 0);
});
