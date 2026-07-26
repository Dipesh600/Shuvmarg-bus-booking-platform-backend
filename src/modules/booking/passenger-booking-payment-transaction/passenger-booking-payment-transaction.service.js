'use strict';

/**
 * src/modules/booking/passenger-booking-payment-transaction/passenger-booking-payment-transaction.service.js
 * Service factory for passenger booking payment transaction module.
 */

function createPassengerBookingPaymentTransactionService({
  repository,
  logger,
  createDate = () => new Date(),
  createTimestamp = () => Date.now(),
}) {
  if (
    !repository ||
    typeof repository.getGatewayFeeConfig !== 'function' ||
    typeof repository.createTransaction !== 'function'
  ) {
    throw new Error(
      'createPassengerBookingPaymentTransactionService requires repository with getGatewayFeeConfig and createTransaction'
    );
  }

  async function createPassengerBookingPaymentTransaction({
    userId,
    scheduleId,
    seatNumbers,
    gateway,
    paymentId,
    originalAmount,
    paymentAmount,
    gatewayAmount,
    smMoneyApplied,
    tempBookingId,
    internalMoneyDebitEntryId,
  } = {}) {
    const gatewayFeeConfig = await repository.getGatewayFeeConfig();
    const gatewayFeeRate =
      gatewayFeeConfig && gatewayFeeConfig[gateway]
        ? gatewayFeeConfig[gateway].feePercent || 0
        : 0;

    const payload = {
      userId,
      tripId: scheduleId,
      seats: seatNumbers,
      transactionType: 'BOOKING',
      gateway: gateway === 'wallet' ? 'sm_wallet' : gateway,
      transactionId: paymentId || `sm_wallet_${createTimestamp()}`,
      originalAmount: originalAmount || paymentAmount,
      totalAmount: (gatewayAmount || 0) + (smMoneyApplied || 0),
      status: 'PAYMENT_RECEIVED',
      paidAt: createDate(),
      meta: {
        tempBookingId,
        paymentMethod:
          gateway === 'wallet'
            ? 'SM_WALLET'
            : gateway.toUpperCase(),
        bookedVia: 'APP',
        smMoneyUsed: smMoneyApplied,
        gatewayAmount,
        smDebitEntryId: internalMoneyDebitEntryId,
        gatewayFeeRate,
      },
    };

    const transaction = await repository.createTransaction(payload);

    if (logger && typeof logger.info === 'function') {
      logger.info(
        'confirmBooking: Transaction record created (PAYMENT_RECEIVED)',
        {
          txnId: transaction._id,
          paymentId,
          userId,
          gatewayAmount,
          smMoneyApplied,
        }
      );
    }

    return {
      transaction,
      gatewayFeeRate,
    };
  }

  return {
    createPassengerBookingPaymentTransaction,
  };
}

module.exports = {
  createPassengerBookingPaymentTransactionService,
};
