const Trip = require("../../../../models/tripModel.js");
const Seat = require("../../../../models/seatsModel.js");
const TripSeatLayoutSnapshot = require("../../../../models/tripSeatLayoutSnapshotModel.js");
const TripSeatLayoutControl = require("../../../../models/tripSeatLayoutControlModel.js");
const PlatformConfig = require("../../../../models/platformConfigModel.js");
const CouponHelper = require("../../../../handlers/couponHelper.js");
const smLedgerService = require("../../wallet/sm-ledger");
const passengerSeatHold = require("../passenger-seat-hold");

const { createPassengerBookingPreparationRepository } = require("./passenger-booking-preparation.repository.js");
const policy = require("./passenger-booking-preparation.policy.js");
const mapper = require("./passenger-booking-preparation.mapper.js");
const { createPassengerBookingPreparationService } = require("./passenger-booking-preparation.service.js");
const { createPassengerBookingPreparationController } = require("./passenger-booking-preparation.controller.js");

const repository = createPassengerBookingPreparationRepository({
  Trip,
  Seat,
  TripSeatLayoutSnapshot,
  TripSeatLayoutControl,
});
const clock = () => new Date();

const service = createPassengerBookingPreparationService({
  repository,
  couponHelper: CouponHelper,
  smLedgerService,
  platformConfig: PlatformConfig,
  passengerSeatHold,
  policy,
  mapper,
  clock,
});

const controller = createPassengerBookingPreparationController({ service });

module.exports = {
  preparePassengerBooking: controller.preparePassengerBooking,
};
