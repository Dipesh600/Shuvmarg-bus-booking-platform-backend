'use strict';

function createPassengerBookingConfirmationCompensation({
  reversePassengerInternalMoneyDebits,
}) {
  return async function reverseInternalMoneyDebitIfNeeded(state, reason) {
    const result = await reversePassengerInternalMoneyDebits({
      splitPaymentDebitEntryId: state.splitPaymentDebitEntryId,
      walletDebitEntryId: state.walletDebitEntryId,
      reason,
    });

    state.splitPaymentDebitEntryId = result.splitPaymentDebitEntryId;
    state.walletDebitEntryId = result.walletDebitEntryId;
  };
}

module.exports = {
  createPassengerBookingConfirmationCompensation,
};
