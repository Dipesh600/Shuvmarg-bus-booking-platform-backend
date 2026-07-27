"use strict";

const createCouponWriteRepository = ({ Coupon, CouponUsage }) => ({
  findByCode(couponCode) {
    return Coupon.findOne({ couponCode });
  },

  create(data) {
    return new Coupon(data).save();
  },

  findById(id) {
    return Coupon.findById(id);
  },

  countUsage(id) {
    return CouponUsage.countDocuments({ couponId: id });
  },

  deleteById(id) {
    return Coupon.findByIdAndDelete(id);
  },
});

module.exports = { createCouponWriteRepository };
