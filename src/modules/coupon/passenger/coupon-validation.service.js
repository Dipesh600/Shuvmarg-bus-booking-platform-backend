"use strict";

function createCouponValidationService({
  repository,
  couponHelper,
  policy,
  mapper,
}) {
  return async function validateCoupon(input) {
    const checked = policy.validateCouponInput(input);
    if (checked.statusCode) return checked;

    const coupon = await repository.findActiveCoupon(input.couponCode);
    if (!coupon) {
      return {
        statusCode: 400,
        body: {
          success: false,
          message: "Invalid coupon code",
          errorCode: "INVALID_COUPON",
        },
      };
    }
    const count = await repository.countValidationUsage(
      input.userId,
      coupon._id
    );
    if (count >= coupon.perUserLimit) {
      return {
        statusCode: 400,
        body: {
          success: false,
          message: policy.userLimitMessage(count, coupon.perUserLimit),
          errorCode: "USER_LIMIT_REACHED",
        },
      };
    }
    const validation = await couponHelper.validateCoupon(
      input.couponCode,
      input.userId,
      checked.amount,
      input.scheduleId,
      input.activeRole
    );
    if (!validation.isValid) {
      return {
        statusCode: 400,
        body: {
          success: false,
          message: validation.error,
          errorCode: validation.errorCode,
        },
      };
    }
    return {
      statusCode: 200,
      body: {
        success: true,
        message: "Coupon is valid!",
        data: mapper.mapValidatedCoupon(validation, input.orderAmount),
      },
    };
  };
}

module.exports = { createCouponValidationService };
