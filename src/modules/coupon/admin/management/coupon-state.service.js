"use strict";

const createCouponStateService = ({ repository, offerNotification }) => {
  const remove = async (id) => {
    if ((await repository.countUsage(id)) > 0) {
      return {
        statusCode: 400,
        body: {
          success: false,
          message:
            "Cannot delete coupon that has been used. You can deactivate it instead.",
        },
      };
    }
    const deletedCoupon = await repository.deleteById(id);
    if (!deletedCoupon) {
      return {
        statusCode: 404,
        body: { success: false, message: "Coupon not found!" },
      };
    }
    return {
      statusCode: 200,
      body: { success: true, message: "Coupon deleted successfully!" },
    };
  };

  const toggle = async (id, adminInfo) => {
    const coupon = await repository.findById(id);
    if (!coupon) {
      return {
        statusCode: 404,
        body: { success: false, message: "Coupon not found!" },
      };
    }
    coupon.isActive = !coupon.isActive;
    coupon.lastModifiedBy = adminInfo.id;
    await coupon.save();
    if (coupon.isActive) {
      offerNotification(
        coupon.couponCode,
        coupon.title,
        coupon.discountType,
        coupon.discountValue
      ).catch(() => {});
    }
    return {
      statusCode: 200,
      body: {
        success: true,
        message:
          `Coupon ${coupon.isActive ? "activated" : "deactivated"} successfully!`,
        data: {
          _id: coupon._id,
          couponCode: coupon.couponCode,
          isActive: coupon.isActive,
        },
      },
    };
  };

  return { remove, toggle };
};

module.exports = { createCouponStateService };
