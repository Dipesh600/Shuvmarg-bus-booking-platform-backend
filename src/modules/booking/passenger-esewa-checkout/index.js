'use strict';

const EsewaPaymentAttempt = require(
  '../../../../models/esewaPaymentAttemptModel.js'
);
const SeatHold = require('../../../../models/seatHoldModel.js');
const Transaction = require('../../../../models/transactionModel.js');
const Trip = require('../../../../models/tripModel.js');
const { verifyEsewaPayment } = require(
  '../../../../services/esewaVerificationService.js'
);
const quote = require('../passenger-booking-confirmation-quote');
const confirmation = require(
  '../passenger-booking-confirmation-orchestrator/passenger-booking-confirmation.composition.js'
);
const dispute = require('../passenger-payment-dispute');
const boardingOptions = require('../passenger-boarding-options');
const { readEsewaCheckoutConfig } = require(
  './passenger-esewa-checkout.config.js'
);
const signature = require('./passenger-esewa-checkout.signature.js');
const policy = require('./passenger-esewa-checkout.policy.js');
const tripPolicy = require('./passenger-esewa-checkout-trip.policy.js');
const mapper = require('./passenger-esewa-checkout.mapper.js');
const {
  validateEsewaResponse,
} = require('./passenger-esewa-checkout-response.service.js');
const {
  createPassengerEsewaCheckoutRepository,
} = require('./passenger-esewa-checkout.repository.js');
const {
  createPassengerEsewaCheckoutInitiationService,
} = require('./passenger-esewa-checkout-initiation.service.js');
const {
  createPassengerEsewaCheckoutFinalizationService,
} = require('./passenger-esewa-checkout-finalization.service.js');
const {
  createPassengerEsewaCheckoutRecoveryService,
} = require('./passenger-esewa-checkout-recovery.service.js');
const {
  createPassengerEsewaCheckoutController,
} = require('./passenger-esewa-checkout.controller.js');
const {
  requireServerOwnedEsewaCheckout,
} = require('./passenger-esewa-checkout.middleware.js');

const repository = createPassengerEsewaCheckoutRepository({
  EsewaPaymentAttempt,
  SeatHold,
  Transaction,
  Trip,
  createReservedAttempt: require('./passenger-esewa-checkout-reservation.service').createReservedAttempt,
});
const initiate = createPassengerEsewaCheckoutInitiationService({
  readConfig: readEsewaCheckoutConfig,
  buildQuote: quote.buildPassengerBookingConfirmationQuote,
  repository,
  signature,
  policy,
  tripPolicy,
  boardingOptions: boardingOptions.resolvePassengerBoardingOptions,
  checkoutFingerprint: require('./passenger-esewa-checkout-reservation.service').checkoutFingerprint,
  authorizeCheckout: require('../../wallet/payment-authorization/purchase-authorization.service').authorizeCheckout,
  captureRefundPolicySnapshot: require('../../../shared/refund-policy-snapshot').captureRefundPolicySnapshot,
});
const recovery = createPassengerEsewaCheckoutRecoveryService({
  ...require('../../../shared/payment-attempt-recovery'),
  repository,
  mapper,
  verifyPayment: verifyEsewaPayment,
  sendDisputeAlert: dispute.sendPassengerPaymentDisputeAdminAlert,
});
const finalize = createPassengerEsewaCheckoutFinalizationService({
  verifyPayment: verifyEsewaPayment,
  readConfig: readEsewaCheckoutConfig,
  repository,
  signature,
  mapper,
  validateResponse: validateEsewaResponse,
  orchestrate: confirmation.orchestratePassengerBookingConfirmation,
  recovery,
  preparePaymentRetry: require('../../../shared/prepare-payment-retry').preparePaymentRetry,
});
const controller = createPassengerEsewaCheckoutController({
  service: { initiate, finalize },
  mapper,
});

module.exports = {
  pendingPassengerEsewaCheckout: require('./passenger-esewa-pending.controller').createPendingCheckoutController({ Attempt: EsewaPaymentAttempt }),
  reconcilePaymentAttempt: finalize,
  initiatePassengerEsewaCheckout:
    controller.initiatePassengerEsewaCheckout,
  finalizePassengerEsewaCheckout:
    controller.finalizePassengerEsewaCheckout,
  requireServerOwnedEsewaCheckout,
};
