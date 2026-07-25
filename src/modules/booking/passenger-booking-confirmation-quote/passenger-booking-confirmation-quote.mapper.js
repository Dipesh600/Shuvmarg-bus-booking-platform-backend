'use strict';

function mapPassengerBookingConfirmationQuote({
  discountAmount,
  finalAmount,
  couponUsed,
  appliedCouponCode,
  requestedSmMoney,
  smMoneyApplied,
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
    gatewayAmount,
    expectedTotal,
  };
}

module.exports = { mapPassengerBookingConfirmationQuote };
