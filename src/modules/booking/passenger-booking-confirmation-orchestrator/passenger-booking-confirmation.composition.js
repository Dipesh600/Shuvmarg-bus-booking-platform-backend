'use strict';

const logger = require('../../../../utils/logger.js');
const quote = require('../passenger-booking-confirmation-quote');
const walletPayment = require('../passenger-wallet-payment');
const splitPayment = require('../passenger-split-payment');
const compensation = require('../passenger-internal-money-compensation');
const esewaVerification = require('../passenger-esewa-verification');
const paymentTransaction = require('../passenger-booking-payment-transaction');
const tripValidation = require('../passenger-post-payment-trip-validation');
const seatCommitment = require('../passenger-seat-commitment');
const bookingPersistence = require('../passenger-booking-persistence');
const reconciliation = require('../passenger-transaction-success-reconciliation');
const paymentDispute = require('../passenger-payment-dispute');
const postCommit = require('../passenger-booking-post-commit');
const passengerSeatHold = require('../passenger-seat-hold');
const {
  createPassengerBookingConfirmationCompensation,
} = require('./passenger-booking-confirmation-compensation.service');
const {
  createPassengerBookingConfirmationPaymentStage,
} = require('./passenger-booking-confirmation-payment-stage.service');
const {
  createPassengerBookingConfirmationFulfillmentStage,
} = require('./passenger-booking-confirmation-fulfillment-stage.service');
const {
  createPassengerBookingConfirmationSuccessStage,
} = require('./passenger-booking-confirmation-success-stage.service');
const {
  createPassengerBookingConfirmationFailureHandler,
} = require('./passenger-booking-confirmation-failure.service');
const {
  createPassengerBookingConfirmationOrchestrator,
} = require('./passenger-booking-confirmation-orchestrator.service');
const {
  createPassengerBookingConfirmationController,
} = require('./passenger-booking-confirmation.controller');

const reverseInternalMoneyDebitIfNeeded =
  createPassengerBookingConfirmationCompensation({
    reversePassengerInternalMoneyDebits:
      compensation.reversePassengerInternalMoneyDebits,
  });
const shared = {
  ...paymentDispute,
  ...seatCommitment,
  _reverseInternalMoneyDebitIfNeeded: reverseInternalMoneyDebitIfNeeded,
  logger,
  restorePassengerHoldAfterFailedConfirmation:
    (input) =>
      passengerSeatHold.restorePassengerHoldAfterFailedConfirmation(input),
};
const runPaymentStage = createPassengerBookingConfirmationPaymentStage({
  authorizeReservedPayment: require('../../../shared/authorize-reserved-payment').authorizeReservedPayment,
  ...quote,
  ...walletPayment,
  ...splitPayment,
  ...esewaVerification,
  ...paymentTransaction,
  claimPassengerHoldForConfirmation:
    (input) => passengerSeatHold.claimPassengerHoldForConfirmation(input),
  restorePassengerHoldAfterFailedConfirmation:
    (input) =>
      passengerSeatHold.restorePassengerHoldAfterFailedConfirmation(input),
  _reverseInternalMoneyDebitIfNeeded: reverseInternalMoneyDebitIfNeeded,
});
const runFulfillmentStage =
  createPassengerBookingConfirmationFulfillmentStage({
    ...shared,
    ...tripValidation,
    ...bookingPersistence,
  });
const runSuccessStage = createPassengerBookingConfirmationSuccessStage({
  ...reconciliation,
  ...postCommit,
  logger,
});
const handleFailure = createPassengerBookingConfirmationFailureHandler(shared);
const orchestratePassengerBookingConfirmation =
  createPassengerBookingConfirmationOrchestrator({
    runPaymentStage,
    runFulfillmentStage,
    runSuccessStage,
    handleFailure,
  });
const confirmPassengerBooking = createPassengerBookingConfirmationController({
  orchestratePassengerBookingConfirmation,
});

module.exports = {
  confirmPassengerBooking,
  orchestratePassengerBookingConfirmation,
};
