function createPassengerBookingPreparationService({
  repository,
  couponHelper,
  smLedgerService,
  platformConfig,
  passengerSeatHold,
  policy,
  mapper,
  clock = () => new Date(),
}) {
  return {
    async preparePassengerBooking({
      scheduleId,
      seatNumbers,
      couponCode,
      smMoneyToUse,
      userId,
      activeRole,
    }) {
      const inputVal = policy.validatePreparationInput({ scheduleId, seatNumbers });
      if (!inputVal.isValid) return { statusCode: inputVal.statusCode, body: inputVal.responseBody };

      const now = clock();

      const trip = await repository.findBookableTripContext(scheduleId);
      const tripVal = policy.validateTripForOnlineBooking(trip, now);
      if (!tripVal.isValid) return { statusCode: tripVal.statusCode, body: tripVal.responseBody };

      let normalizedSeats;
      try {
        normalizedSeats = passengerSeatHold.normalizeSeatNumbers(seatNumbers);
      } catch (err) {
        if (err.statusCode && err.responseBody) return { statusCode: err.statusCode, body: err.responseBody };
        return {
          statusCode: 400,
          body: { success: false, message: "Invalid seat selection.", errorCode: "INVALID_SEAT_SELECTION" },
        };
      }

      const amountResult = policy.calculateAuthoritativeOriginalAmount(
        trip,
        normalizedSeats
      );
      if (!amountResult.isValid) {
        return {
          statusCode: amountResult.statusCode,
          body: amountResult.responseBody,
        };
      }
      const authoritativeOriginalAmount = amountResult.originalAmount;

      const seatDoc = await repository.findTripSeatDocument(scheduleId);
      if (!seatDoc) return { statusCode: 404, body: { success: false, message: "Seat data not found for schedule." } };

      const {
        invalidSeats,
        alreadyBookedSeats,
        blockedSeats,
      } = policy.classifyRequestedSeats(seatDoc, normalizedSeats);
      if (invalidSeats.length > 0) {
        return { statusCode: 400, body: { success: false, message: `Invalid seat(s): ${invalidSeats.join(", ")}` } };
      }
      if (alreadyBookedSeats.length > 0) {
        return { statusCode: 400, body: { success: false, message: `Seat ${alreadyBookedSeats.join(", ")} is already booked!` } };
      }
      if (blockedSeats.length > 0) {
        return {
          statusCode: 409,
          body: {
            success: false,
            message: `Seat ${blockedSeats.join(", ")} is unavailable.`,
            errorCode: "SEAT_UNAVAILABLE",
          },
        };
      }

      let discountAmount = 0;
      let couponDetails = null;
      if (couponCode && couponCode.trim() !== "") {
        const val = await couponHelper.validateCoupon(
          couponCode, userId, authoritativeOriginalAmount, scheduleId, activeRole
        );
        if (!val.isValid) return { statusCode: 400, body: { success: false, message: val.error, errorCode: val.errorCode } };
        discountAmount = val.discountAmount;
        couponDetails = mapper.mapValidatedCoupon(val);
      }

      const [balanceResult, smConfig] = await Promise.all([
        smLedgerService.computeSpendableBalance(userId),
        platformConfig.getConfig("sm_money_config"),
      ]);

      const quote = policy.calculatePreparationQuote({
        originalAmount: authoritativeOriginalAmount,
        couponDiscount: discountAmount,
        spendableBalance: balanceResult.display,
        requestedSmMoney: smMoneyToUse,
        maxDiscountPercent: (smConfig && smConfig.maxDiscountPercent) || 80,
      });

      const hold = await passengerSeatHold.createOrReusePassengerSeatHold({
        userId,
        tripId: scheduleId,
        seatNumbers: normalizedSeats,
        originalAmount: authoritativeOriginalAmount,
        now,
      });

      return {
        statusCode: 200,
        body: mapper.mapPassengerBookingPreparationResponse({
          hold,
          scheduleId,
          originalAmount: authoritativeOriginalAmount,
          couponDiscount: quote.couponDiscount,
          couponDetails,
          afterCouponAmount: quote.afterCouponAmount,
          spendableBalance: quote.spendableBalance,
          smMoneyApplied: quote.smMoneyApplied,
          maxSmMoneyAllowed: quote.maxSmMoneyAllowed,
          totalDiscount: quote.totalDiscount,
          gatewayAmount: quote.gatewayAmount,
          paymentAmount: quote.paymentAmount,
        }),
      };
    },
  };
}

module.exports = {
  createPassengerBookingPreparationService,
};
