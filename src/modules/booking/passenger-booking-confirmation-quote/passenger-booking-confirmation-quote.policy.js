'use strict';

const SUPPORTED_BOOKING_GATEWAYS = new Set(['esewa', 'wallet']);

function validateConfirmationGateway(gateway) {
  if (!gateway || typeof gateway !== 'string' || !SUPPORTED_BOOKING_GATEWAYS.has(gateway)) {
    return {
      isValid: false,
      statusCode: 400,
      responseBody: {
        success: false,
        message: 'The selected payment gateway is not supported.',
        errorCode: 'UNSUPPORTED_PAYMENT_GATEWAY',
      },
    };
  }
  return { isValid: true };
}

function validateConfirmationReference(tempBookingId) {
  if (!tempBookingId) {
    return {
      isValid: false,
      statusCode: 400,
      responseBody: {
        success: false,
        message: 'Missing required fields for booking confirmation',
      },
    };
  }
  return { isValid: true };
}

function normalizeRequestedSmMoney(smMoneyToUse) {
  return Math.max(0, Math.floor(Number(smMoneyToUse) || 0));
}

function calculateConfirmationQuote({
  gateway,
  originalAmount,
  discountAmount,
  paymentAmount,
  requestedSmMoney,
  spendableBalance,
  refundBalance = 0,
  restrictedBalance = spendableBalance,
  maxDiscountPercent,
}) {
  const afterCoupon = originalAmount - discountAmount;
  const maxTotalDiscount = Math.floor(originalAmount * (maxDiscountPercent / 100));
  const restrictedMoneyAllowed = Math.min(restrictedBalance, Math.max(0, maxTotalDiscount - discountAmount));
  const maxSmMoneyAllowed = Math.min(afterCoupon, refundBalance + restrictedMoneyAllowed);

  let smMoneyApplied = Math.min(requestedSmMoney, spendableBalance, maxSmMoneyAllowed);
  if (smMoneyApplied <= 0) smMoneyApplied = 0;

  let gatewayAmount;
  if (gateway === 'wallet') {
    smMoneyApplied = Math.min(afterCoupon, spendableBalance, maxSmMoneyAllowed);
    gatewayAmount = 0;
  } else {
    gatewayAmount = afterCoupon - smMoneyApplied;
  }

  const refundMoneyApplied = Math.min(refundBalance, smMoneyApplied);
  const restrictedMoneyApplied = smMoneyApplied - refundMoneyApplied;
  return { smMoneyApplied, refundMoneyApplied, restrictedMoneyApplied, gatewayAmount, maxSmMoneyAllowed };
}

function validateConfirmationAmount({ finalAmount, gatewayAmount, smMoneyApplied }) {
  const expectedTotal = gatewayAmount + smMoneyApplied;
  if (Math.abs(finalAmount - expectedTotal) > 1) {
    return {
      isValid: false,
      statusCode: 400,
      responseBody: {
        success: false,
        message: 'Amount mismatch between coupon, wallet, and gateway calculations.',
        errorCode: 'AMOUNT_MISMATCH',
      },
      warnData: { finalAmount, gatewayAmount, smMoneyApplied, expectedTotal },
    };
  }
  return { isValid: true, expectedTotal };
}

function validatePassengerBookingConfirmationRequest({ gateway, tempBookingId }) {
  const gatewayValidation = validateConfirmationGateway(gateway);
  if (!gatewayValidation.isValid) {
    return {
      ok: false,
      statusCode: gatewayValidation.statusCode,
      body: gatewayValidation.responseBody,
    };
  }
  const referenceValidation = validateConfirmationReference(tempBookingId);
  if (!referenceValidation.isValid) {
    return {
      ok: false,
      statusCode: referenceValidation.statusCode,
      body: referenceValidation.responseBody,
    };
  }
  return { ok: true };
}

module.exports = {
  validateConfirmationGateway,
  validateConfirmationReference,
  validatePassengerBookingConfirmationRequest,
  normalizeRequestedSmMoney,
  calculateConfirmationQuote,
  validateConfirmationAmount,
};
