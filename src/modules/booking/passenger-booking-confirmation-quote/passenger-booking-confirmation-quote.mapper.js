'use strict';

function mapPassengerBookingConfirmationQuote({
  discountAmount,
  finalAmount,
  couponUsed,
  appliedCouponCode,
  requestedSmMoney,
  smMoneyApplied,
  refundMoneyApplied,
  restrictedMoneyApplied,
  gatewayAmount,
  expectedTotal,
}) {
  return {
    discountAmount,
    finalAmount,
    couponUsed,
    appliedCouponCode,
    requestedSmMoney,
    smMoneyApplied,
    refundMoneyApplied,
    restrictedMoneyApplied,
    gatewayAmount,
    expectedTotal,
  };
}

module.exports = { mapPassengerBookingConfirmationQuote };
