'use strict';

/**
 * Coordinates compensation for passenger internal-money debits.
 */
function createPassengerInternalMoneyCompensationService({
  smLedgerService,
  splitPayment,
  logger,
}) {
  if (!smLedgerService || typeof smLedgerService.reverseDebit !== 'function') {
    throw new Error('createPassengerInternalMoneyCompensationService requires smLedgerService');
  }
  if (!splitPayment || typeof splitPayment.reversePassengerSplitPaymentDebit !== 'function') {
    throw new Error('createPassengerInternalMoneyCompensationService requires splitPayment');
  }

  async function reversePassengerInternalMoneyDebits({
    splitPaymentDebitEntryId,
    walletDebitEntryId,
    reason,
  }) {
    let nextSplitPaymentDebitEntryId = splitPaymentDebitEntryId || null;
    let nextWalletDebitEntryId = walletDebitEntryId || null;

    if (splitPaymentDebitEntryId) {
      await splitPayment.reversePassengerSplitPaymentDebit({
        debitEntryId: splitPaymentDebitEntryId,
        reason,
      });
      nextSplitPaymentDebitEntryId = null;
    }

    if (walletDebitEntryId) {
      try {
        await smLedgerService.reverseDebit(walletDebitEntryId);
        if (logger && typeof logger.info === 'function') {
          logger.info('confirmBooking: SM Money debit reversed', {
            smDebitEntryId: walletDebitEntryId,
            reason,
          });
        }
        nextWalletDebitEntryId = null;
      } catch (reverseErr) {
        if (logger && typeof logger.error === 'function') {
          logger.error('confirmBooking: CRITICAL — failed to reverse SM Money debit', {
            smDebitEntryId: walletDebitEntryId,
            reason,
            error: reverseErr.message,
          });
        }
      }
    }

    return {
      splitPaymentDebitEntryId: nextSplitPaymentDebitEntryId,
      walletDebitEntryId: nextWalletDebitEntryId,
    };
  }

  return {
    reversePassengerInternalMoneyDebits,
  };
}

module.exports = {
  createPassengerInternalMoneyCompensationService,
};
