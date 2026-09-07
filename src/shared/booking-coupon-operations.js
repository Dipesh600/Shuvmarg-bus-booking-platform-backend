"use strict";
const mongoose = require("mongoose");
const Booking = require("../../models/bookTicketModel");
const Coupon = require("../../models/couponModel");
const Usage = require("../../models/couponUsageModel");
const { withMongoTransaction } = require("./with-mongo-transaction");
const { recordBookingCoupon } = require("./record-booking-coupon");
async function applyBookedCoupon(couponCode, userId, bookingId, originalAmount) {
  return withMongoTransaction(mongoose, null, async session => {
    const booking = await Booking.findOneAndUpdate({ _id: bookingId, userId, status: "booked" },
      { $inc: { __v: 1 } }, { session, new: true });
    if (!booking || booking.couponCode !== couponCode.toUpperCase() || booking.originalAmount !== originalAmount) {
      throw new Error("Coupon does not match an active owned booking");
    }
    const usage = await recordBookingCoupon(booking, session);
    if (!usage) throw new Error("Booking has no coupon");
    return { success: true, couponUsage: usage, originalAmount: usage.originalAmount,
      discountAmount: usage.discountAmount, finalAmount: usage.finalAmount, couponCode: usage.couponCode };
  });
}
async function refundBookedCoupon(bookingId) {
  return withMongoTransaction(mongoose, null, async session => {
    const booking = await Booking.findOneAndUpdate({ _id: bookingId, status: "cancelled" },
      { $inc: { __v: 1 } }, { session, new: true });
    if (!booking) throw new Error("Coupon refund requires a cancelled booking");
    const usages = await Usage.find({ bookingId }).session(session);
    if (usages.length > 1) throw new Error("Duplicate coupon usage requires review");
    const usage = usages[0];
    if (!usage || usage.status !== "applied") return { success: true, message: "No active coupon usage to refund" };
    const updated = await Coupon.updateOne({ _id: usage.couponId, usedCount: { $gt: 0 } },
      { $inc: { usedCount: -1 } }, { session });
    if (updated.modifiedCount !== 1) throw new Error("Coupon counter requires review");
    usage.status = "refunded"; await usage.save({ session });
    return { success: true, message: "Coupon usage refunded successfully", refundedAmount: usage.discountAmount };
  });
}
module.exports = { applyBookedCoupon, refundBookedCoupon };
