"use strict";

const mongoose = require("mongoose");
const Bus = require("../../../../models/fleetModel");
const Trip = require("../../../../models/tripModel");
const Booking = require("../../../../models/bookTicketModel");
const Refund = require("../../../../models/refundModel");
const Schedule = require("../../../../models/scheduleModel");
const DriverProfile = require("../../../../models/driverProfileModel");
const logger = require("../../../../utils/logger");
const timePolicy = require("./time.policy");
const bookingStatistics = require("./booking-statistics.service");
const transitionPolicy = require("./trip-transition.policy");
const {
  createFleetQueryRepository,
} = require("./fleet-query.repository");
const {
  createTripQueryRepository,
} = require("./trip-query.repository");
const {
  createScheduleQueryService,
} = require("./schedule-query.service");
const {
  createFinancialSummaryService,
} = require("./financial-summary.service");
const { createDashboardService } = require("./dashboard.service");
const { createManifestService } = require("./manifest.service");
const {
  createTripCancellationService,
} = require("./trip-cancellation.service");
const {
  createReferralUnlockService,
} = require("./referral-unlock.service");
const { createTripStatusService } = require("./trip-status.service");
const {
  createDriverAssignmentService,
} = require("./driver-assignment.service");
const {
  createFleetWorkstationController,
} = require("./fleet-workstation.controller");

const fleetRepository = createFleetQueryRepository({ Bus, DriverProfile });
const tripRepository = createTripQueryRepository({ Trip });
const scheduleService = createScheduleQueryService({ Schedule, Trip });
const financialService = createFinancialSummaryService({
  mongoose,
  Booking,
  Refund,
});
const dashboardService = createDashboardService({
  fleetRepository,
  tripRepository,
  scheduleService,
  bookingStatistics: {
    aggregateTodayStats: (input) =>
      bookingStatistics.aggregateTodayStats({ Booking, ...input }),
    attachTripStats: (input) =>
      bookingStatistics.attachTripStats({ Booking, ...input }),
  },
  financialService,
  timePolicy,
});
const manifestService = createManifestService({ Trip, Booking });
const cancellationService = createTripCancellationService({ Booking, Refund });
const referralService = createReferralUnlockService({
  Booking,
  loadUser: () => require("../../../../models/userModel"),
  loadReferralService: () =>
    require("../../referral/reward-lifecycle"),
  logger,
});
const tripStatusService = createTripStatusService({
  Trip,
  transitionPolicy,
  cancellationService,
  referralService,
});
const driverAssignmentService = createDriverAssignmentService({
  Trip,
  DriverProfile,
});

module.exports = createFleetWorkstationController({
  dashboardService,
  manifestService,
  tripStatusService,
  driverAssignmentService,
  logger,
});
