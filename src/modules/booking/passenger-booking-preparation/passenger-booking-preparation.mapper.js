function mapValidatedCoupon(validation) {
  if (!validation || !validation.coupon) return null;
  return {
    couponId: validation.coupon._id,
    couponCode: validation.coupon.couponCode,
    title: validation.coupon.title,
    discountType: validation.coupon.discountType,
    discountValue: validation.coupon.discountValue,
  };
}

function mapPassengerBookingPreparationResponse(params) {
  return {
    success: true,
    message: "Booking prepared successfully. Proceed with payment.",
    data: {
      tempBookingId: params.hold.tempBookingId,
      scheduleId: params.scheduleId,
      seats: params.hold.seatNumbers,
      originalAmount: params.originalAmount,
      couponDiscount: params.couponDiscount,
      couponDetails: params.couponDetails,
      afterCouponAmount: params.afterCouponAmount,
      smMoneyBalance: params.spendableBalance,
      smMoneyApplied: params.smMoneyApplied,
      refundMoneyApplied: params.refundMoneyApplied,
      restrictedMoneyApplied: params.restrictedMoneyApplied,
      maxSmMoneyAllowed: params.maxSmMoneyAllowed,
      totalDiscount: params.totalDiscount,
      gatewayAmount: params.gatewayAmount,
      paymentAmount: params.paymentAmount,
      expiresAt: params.hold.expiresAt,
    },
  };
}

module.exports = {
  mapValidatedCoupon,
  mapPassengerBookingPreparationResponse,
};
