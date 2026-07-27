"use strict";

const createCouponReadRepository = ({ Coupon }) => ({
  findPage(query, page, limit) {
    return Coupon.find(query)
      .populate("createdBy", "name email")
      .populate("lastModifiedBy", "name email")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
  },

  count(query) {
    return Coupon.countDocuments(query);
  },

  findById(id) {
    return Coupon.findById(id)
      .populate("createdBy", "name email")
      .populate("lastModifiedBy", "name email");
  },
});

module.exports = { createCouponReadRepository };
