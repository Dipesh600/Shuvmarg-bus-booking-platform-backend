'use strict';

function createPassengerEsewaCheckoutInitiationService(deps) {
  return async function initiatePassengerEsewaCheckout({
    userId,
    activeRole,
    hold,
    body = {},
  }) {
    const config = deps.readConfig();
    const quoteResult = await deps.buildQuote({
      gateway: 'esewa',
      tempBookingId: hold.tempBookingId,
      paymentAmount: hold.originalAmount,
      originalAmount: hold.originalAmount,
      couponCode: body.couponCode,
      smMoneyToUse: body.smMoneyToUse,
      userId,
      scheduleId: hold.tripId,
      activeRole,
    });
    if (!quoteResult.ok) return quoteResult;

    const passengerDetails = deps.policy.normalizePassengerDetails(
      body.passengerDetails,
      hold.seatNumbers
    );
    const trip = await deps.repository.findCheckoutTrip(hold.tripId);
    const hasCanonicalBoarding = Boolean(body.boardingPoint?.sourceType);
    const hasCanonicalDropping = Boolean(body.droppingPoint?.sourceType);
    if (hasCanonicalBoarding !== hasCanonicalDropping) {
      throw deps.policy.validationError(
        'Both boarding and dropping selections must use the same selection format.'
      );
    }
    let boardingPoint;
    let droppingPoint;
    if (hasCanonicalBoarding) {
      const options = await deps.boardingOptions({
        tripId: String(hold.tripId),
        originStopId: body.boardingPoint.stopId,
        destinationStopId: body.droppingPoint.stopId,
      });
      boardingPoint = deps.tripPolicy.resolveCanonicalBoardingSelection(
        body.boardingPoint, options.pickupOptions, 'Boarding point'
      );
      droppingPoint = deps.tripPolicy.resolveCanonicalBoardingSelection(
        body.droppingPoint, options.dropOptions, 'Dropping point'
      );
    } else {
      const configuredPoints =
        deps.tripPolicy.resolveConfiguredCheckoutPoints(trip);
      boardingPoint = deps.tripPolicy.resolveCanonicalPoint(
        body.boardingPoint, configuredPoints.boardingPoints, 'Boarding point'
      );
      droppingPoint = deps.tripPolicy.resolveCanonicalPoint(
        body.droppingPoint, configuredPoints.droppingPoints, 'Dropping point'
      );
    }
    const tripSnapshot = deps.tripPolicy.resolveCanonicalTripSnapshot(
      trip,
      boardingPoint,
      droppingPoint
    );
    const checkoutBoardingPoint = { ...boardingPoint };
    const checkoutDroppingPoint = { ...droppingPoint };
    const transactionUuid = deps.policy.createTransactionUuid();
    const totalAmount = deps.policy.formatAmount(
      quoteResult.quote.gatewayAmount
    );
    const signature = deps.signature.signEsewaRequest({
      totalAmount,
      transactionUuid,
      productCode: config.productCode,
      secretKey: config.secretKey,
    });
    const resultUrl = `${config.passengerUrl}/payment/esewa`;
    const fields = {
      amount: totalAmount,
      tax_amount: '0',
      total_amount: totalAmount,
      transaction_uuid: transactionUuid,
      product_code: config.productCode,
      product_service_charge: '0',
      product_delivery_charge: '0',
      success_url: `${resultUrl}/success/${transactionUuid}`,
      failure_url: `${resultUrl}/failure/${transactionUuid}`,
      signed_field_names: deps.signature.REQUEST_SIGNED_FIELDS,
      signature,
    };
    const checkoutPayload = {
      tempBookingId: hold.tempBookingId,
      scheduleId: String(hold.tripId),
      seatNumbers: hold.seatNumbers,
      couponCode: body.couponCode || null,
      smMoneyToUse: quoteResult.quote.requestedSmMoney,
      boardingPoint: checkoutBoardingPoint,
      droppingPoint: checkoutDroppingPoint,
      passengerDetails,
      ...tripSnapshot,
    };
    const attempt = await deps.repository.createAttempt({
      userId,
      holdId: hold._id,
      tempBookingId: hold.tempBookingId,
      transactionUuid,
      productCode: config.productCode,
      originalAmount: hold.originalAmount,
      gatewayAmount: quoteResult.quote.gatewayAmount,
      finalAmount: quoteResult.quote.finalAmount,
      discountAmount: quoteResult.quote.discountAmount,
      smMoneyApplied: quoteResult.quote.smMoneyApplied,
      confirmationQuote: quoteResult.quote,
      checkoutPayload,
      formFields: fields,
      holdExpiresAt: hold.expiresAt,
    });

    return {
      statusCode: 201,
      body: {
        success: true,
        data: {
          transactionUuid: attempt.transactionUuid,
          paymentUrl: config.paymentUrl,
          fields: attempt.formFields,
          expiresAt: attempt.holdExpiresAt,
        },
      },
    };
  };
}

module.exports = { createPassengerEsewaCheckoutInitiationService };
