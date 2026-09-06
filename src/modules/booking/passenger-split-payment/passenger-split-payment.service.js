'use strict';

/**
 * src/modules/booking/passenger-split-payment/passenger-split-payment.service.js
 * Service for passenger split-payment SM Money debit and reversal lifecycle.
 */

function createPassengerSplitPaymentService({ smLedgerService, logger, mapper }) {
  if (!smLedgerService || typeof smLedgerService.debitLedgerFIFO !== 'function' || typeof smLedgerService.reverseDebit !== 'function') {
    throw new Error('createPassengerSplitPaymentService: smLedgerService is required');
  }
  if (!mapper || typeof mapper.mapSplitPaymentDebitFailure !== 'function') {
    throw new Error('createPassengerSplitPaymentService: mapper is required');
  }

  async function debitPassengerSplitPayment({ gateway, userId, amount, tempBookingId }) {
    if (gateway === 'wallet' || !amount || amount <= 0) {
      return { ok: true, applied: false, debitEntryId: null };
    }

    try {
      const debitEntry = await smLedgerService.debitLedgerFIFO({
        userId,
        amount,
        bookingId: null,
        operationKey: `checkout:${tempBookingId}`,
        paymentContext: { tempBookingId, gateway },
        note: `SM Money spent at checkout: Rs. ${amount} (temp: ${tempBookingId})`,
      });

      if (!debitEntry || !debitEntry._id) {
        throw new Error('Split payment debit did not return a debit entry');
      }

      const debitEntryId = debitEntry._id;

      if (logger && typeof logger.info === 'function') {
        logger.info('confirmBooking: SM Money debited (split payment)', {
          userId,
          amount,
          debitEntryId,
        });
      }

      return {
        ok: true,
        applied: true,
        debitEntryId,
      };
    } catch (error) {
      if (logger && typeof logger.warn === 'function') {
        logger.warn('confirmBooking: SM Money FIFO debit failed', {
          userId,
          amount,
          error: error.message,
        });
      }

      return mapper.mapSplitPaymentDebitFailure(error);
    }
  }

  async function reversePassengerSplitPaymentDebit({ debitEntryId, reason }) {
    if (!debitEntryId) {
      return { reversed: false, skipped: true };
    }

    try {
      await smLedgerService.reverseDebit(debitEntryId);

      if (logger && typeof logger.info === 'function') {
        logger.info('confirmBooking: SM Money debit reversed', {
          debitEntryId,
          reason,
        });
      }

      return { reversed: true, skipped: false };
    } catch (error) {
      if (logger && typeof logger.error === 'function') {
        logger.error('confirmBooking: CRITICAL — failed to reverse SM Money debit', {
          debitEntryId,
          reason,
          error: error.message,
        });
      }

      return { reversed: false, skipped: false, error };
    }
  }

  return {
    debitPassengerSplitPayment,
    reversePassengerSplitPaymentDebit,
  };
}

module.exports = {
  createPassengerSplitPaymentService,
};
