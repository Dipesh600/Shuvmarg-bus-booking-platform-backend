const { createPassengerBookingCancellationRepository } = require("./passenger-booking-cancellation.repository.js");
const { createPassengerBookingCancellationSeatService } = require("./passenger-booking-cancellation-seat.service.js");
const { createPassengerBookingCancellationRefundService } = require("./passenger-booking-cancellation-refund.service.js");
const { createPassengerBookingCancellationNotificationService } = require("./passenger-booking-cancellation-notification.service.js");
const { createPassengerOperatorRefundDestinationService } = require("./passenger-operator-refund-destination.service.js");

const { createPassengerBookingCancellationEstimateService } = require("./passenger-booking-cancellation-estimate.service.js");
const { createPassengerBookingCancellationService } = require("./passenger-booking-cancellation.service.js");
const { createPassengerBookingCancellationController } = require("./passenger-booking-cancellation.controller.js");

const repository = createPassengerBookingCancellationRepository();
const seatService = createPassengerBookingCancellationSeatService();

const loadClawbackCashback = () =>
  require("../../wallet/sm-ledger").clawbackCashback;
const loadCreditWallet = () => require("../../../../services/walletService").creditWallet;

const cancellationRefundService = createPassengerBookingCancellationRefundService(
  repository,
  loadClawbackCashback,
  loadCreditWallet
);
const cancellationNotificationService = createPassengerBookingCancellationNotificationService(repository);
const cancellationEstimateService = createPassengerBookingCancellationEstimateService(repository);
const operatorRefundDestinationService = createPassengerOperatorRefundDestinationService(repository, loadCreditWallet);
const cancellationService = createPassengerBookingCancellationService(
  repository,
  seatService,
  cancellationRefundService,
  cancellationNotificationService
);

const controller = createPassengerBookingCancellationController(
  cancellationService,
  cancellationEstimateService,
  operatorRefundDestinationService
);

module.exports = {
  cancelPassengerBooking: controller.cancelPassengerBooking,
  estimatePassengerBookingCancellation: controller.estimatePassengerBookingCancellation,
  selectOperatorRefundDestination: controller.selectOperatorRefundDestination,
};
