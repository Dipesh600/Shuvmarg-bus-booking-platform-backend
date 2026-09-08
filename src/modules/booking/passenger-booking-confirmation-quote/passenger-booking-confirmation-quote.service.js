'use strict';

function createPassengerBookingConfirmationQuoteService({
  couponHelper,
  smLedgerService,
  platformConfig,
  logger,
  policy,
  mapper,
}) {
  async function buildPassengerBookingConfirmationQuote({
    gateway,
    tempBookingId,
    paymentAmount,
    originalAmount,
    couponCode,
    smMoneyToUse,
    userId,
    scheduleId,
    activeRole,
  }) {
    // 1. Validate gateway
    const gwCheck = policy.validateConfirmationGateway(gateway);
    if (!gwCheck.isValid) return { ok: false, statusCode: gwCheck.statusCode, body: gwCheck.responseBody };

    // 2. Validate tempBookingId
    const refCheck = policy.validateConfirmationReference(tempBookingId);
    if (!refCheck.isValid) return { ok: false, statusCode: refCheck.statusCode, body: refCheck.responseBody };

    // 3. Initialise coupon state
    let discountAmount = 0;
    let finalAmount = originalAmount;
    let couponUsed = null;
    let appliedCouponCode = null;

    // 4. Validate coupon only when couponCode is non-empty
    if (couponCode && couponCode.trim() !== '') {
      const validation = await couponHelper.validateCoupon(
        couponCode,
        userId,
        originalAmount,
        scheduleId,
        activeRole
      );
      if (!validation.isValid) {
        return {
          ok: false,
          statusCode: 400,
          body: {
            success: false,
            message: `Coupon validation failed: ${validation.error}`,
            errorCode: 'COUPON_INVALID_DURING_CONFIRMATION',
          },
        };
      }
      discountAmount = validation.discountAmount;
      finalAmount = validation.finalAmount;
      couponUsed = validation.coupon._id;
      appliedCouponCode = validation.coupon.couponCode;
    }

    // 6. Normalize requested SM Money
    const requestedSmMoney = policy.normalizeRequestedSmMoney(smMoneyToUse);

    // 7. Load balance and config only when requested SM Money is positive
    let spendableBalance = 0;
    let refundBalance = 0;
    let restrictedBalance = 0;
    let maxDiscountPercent = 80;

    if (requestedSmMoney > 0 || gateway === 'wallet') {
      const [balanceResult, smConfig] = await Promise.all([
        smLedgerService.computePurchaseBalance(userId),
        platformConfig.getConfig('sm_money_config'),
      ]);
      // 8. Direct access — throws if balanceResult is null/undefined
      spendableBalance = balanceResult.display;
      refundBalance = balanceResult.refund;
      restrictedBalance = balanceResult.restricted;
      maxDiscountPercent = (smConfig && smConfig.maxDiscountPercent) || 80;
    }

    // 10. Calculate the quote
    const { smMoneyApplied, refundMoneyApplied, restrictedMoneyApplied, gatewayAmount } = policy.calculateConfirmationQuote({
      gateway,
      originalAmount,
      discountAmount,
      paymentAmount,
      requestedSmMoney,
      spendableBalance,
      refundBalance,
      restrictedBalance,
      maxDiscountPercent,
    });

    // 11. Validate amount consistency
    const amountCheck = policy.validateConfirmationAmount({
      finalAmount,
      gatewayAmount,
      smMoneyApplied,
      refundMoneyApplied,
      restrictedMoneyApplied,
    });
    if (!amountCheck.isValid) {
      logger.warn('confirmBooking: Amount mismatch in confirmation quote', amountCheck.warnData);
      return { ok: false, statusCode: amountCheck.statusCode, body: amountCheck.responseBody };
    }

    // 12. Map and return the quote
    const quote = mapper.mapPassengerBookingConfirmationQuote({
      discountAmount,
      finalAmount,
      couponUsed,
      appliedCouponCode,
      requestedSmMoney,
      smMoneyApplied,
      refundMoneyApplied,
      restrictedMoneyApplied,
      gatewayAmount,
      expectedTotal: amountCheck.expectedTotal,
    });

    return { ok: true, quote };
  }

  return { buildPassengerBookingConfirmationQuote };
}

module.exports = { createPassengerBookingConfirmationQuoteService };
