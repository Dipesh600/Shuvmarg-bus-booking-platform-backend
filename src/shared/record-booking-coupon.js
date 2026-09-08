"use strict";
const Coupon = require("../../models/couponModel");
const Usage = require("../../models/couponUsageModel");
const { toMinorUnits, fromMinorUnits } = require("./money");
async function recordBookingCoupon(booking, session) {
  if (!booking.couponUsed) return null;
  const existing = await Usage.find({ bookingId: booking._id }).session(session);
  if (existing.length) {
    if (existing.length !== 1 || String(existing[0].userId) !== String(booking.userId)
      || String(existing[0].couponId) !== String(booking.couponUsed)
      || toMinorUnits(existing[0].discountAmount) !== toMinorUnits(booking.discountAmount)) {
      throw new Error("Existing coupon usage requires review");
    }
    return existing[0];
  }
  // Updating the coupon serializes its global and per-user limits across bookings.
  const coupon = await Coupon.findOneAndUpdate({ _id: booking.couponUsed, couponCode: booking.couponCode },
    { $inc: { __v: 1 } }, { session, new: true });
  if (!coupon) throw new Error("Booked coupon no longer exists");
  const now = new Date();
  const used = await Usage.countDocuments({ couponId: coupon._id, userId: booking.userId, status: "applied" }).session(session);
  if (!coupon.isActive || now < coupon.validFrom || now > coupon.validTo
    || booking.originalAmount < coupon.minOrderAmount
    || (coupon.totalUsageLimit && coupon.usedCount >= coupon.totalUsageLimit)
    || used >= coupon.perUserLimit) throw new Error("Coupon is no longer available");
  let discount = coupon.discountType === "percentage"
    ? Math.round(booking.originalAmount * coupon.discountValue) / 100 : coupon.discountValue;
  if (coupon.maxDiscountAmount) discount = Math.min(discount, coupon.maxDiscountAmount);
  discount = Math.min(discount, booking.originalAmount);
  if (toMinorUnits(discount) !== toMinorUnits(booking.discountAmount)) throw new Error("Coupon terms changed before booking commit");
  const [usage] = await Usage.create([{ userId: booking.userId, couponId: coupon._id,
    couponCode: coupon.couponCode, bookingId: booking._id, originalAmount: booking.originalAmount,
    discountAmount: booking.discountAmount,
    finalAmount: fromMinorUnits(toMinorUnits(booking.originalAmount) - toMinorUnits(booking.discountAmount)),
    discountType: coupon.discountType, discountValue: coupon.discountValue,
  }], { session });
  await Coupon.updateOne({ _id: coupon._id }, { $inc: { usedCount: 1 } }, { session });
  return usage;
}
module.exports = { recordBookingCoupon };
