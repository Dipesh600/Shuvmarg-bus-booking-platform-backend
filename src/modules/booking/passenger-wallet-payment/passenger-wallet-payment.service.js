'use strict';

/**
 * src/modules/booking/passenger-wallet-payment/passenger-wallet-payment.service.js
 *
 * Service logic for debiting passenger wallet for full-wallet booking payment.
 */

function createPassengerWalletPaymentService({
  walletRepository,
  smLedgerService,
  logger,
  mapper,
}) {
  if (!walletRepository || typeof walletRepository.findPassengerWalletByUserId !== 'function') {
    throw new Error('createPassengerWalletPaymentService: walletRepository is required');
  }
  if (!smLedgerService || typeof smLedgerService.debitLedgerFIFO !== 'function') {
    throw new Error('createPassengerWalletPaymentService: smLedgerService is required');
  }
  if (!mapper) {
    throw new Error('createPassengerWalletPaymentService: mapper is required');
  }

  async function debitPassengerWalletPayment({ userId, amount, tempBookingId,
    refundMoneyApplied = 0, restrictedMoneyApplied = 0 }) {
    const userWallet = await walletRepository.findPassengerWalletByUserId(userId);

    if (!userWallet) {
      return mapper.mapWalletNotAvailableResult();
    }

    if (userWallet.status !== 'active') {
      return mapper.mapWalletFrozenResult();
    }

    try {
      const debitEntry = await smLedgerService.debitLedgerFIFO({
        userId,
        amount,
        bookingId: null,
        operationKey: `checkout:${tempBookingId}`,
        paymentContext: { tempBookingId, gateway: "wallet", preferRefundCredit: true,
          refundMoneyApplied, restrictedMoneyApplied },
        note: `SM Wallet full payment: Rs. ${amount} (temp: ${tempBookingId})`,
      });

      if (!debitEntry || !debitEntry._id) {
        throw new Error('Wallet debit did not return a debit entry');
      }

      const debitEntryId = debitEntry._id;

      if (logger && typeof logger.info === 'function') {
        logger.info('confirmBooking: SM Wallet debited successfully (full payment)', {
          userId,
          amount,
          debitEntryId,
        });
      }

      return {
        ok: true,
        debitEntryId,
      };
    } catch (walletErr) {
      if (logger && typeof logger.warn === 'function') {
        logger.warn('confirmBooking: SM Wallet debit failed', {
          userId,
          amount,
          error: walletErr.message,
        });
      }

      return mapper.mapWalletDebitFailureResult(walletErr);
    }
  }

  return {
    debitPassengerWalletPayment,
  };
}

module.exports = {
  createPassengerWalletPaymentService,
};
