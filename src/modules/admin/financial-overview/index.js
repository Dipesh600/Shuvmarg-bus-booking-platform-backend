"use strict";

const Booking = require("../../../../models/bookTicketModel");
const Settlement = require("../../../../models/settlementModel");
const Refund = require("../../../../models/refundModel");
const logger = require("../../../../utils/logger");
const {
  createBookingFinancialRepository,
} = require("./booking-financial.repository");
const {
  createSettlementFinancialRepository,
} = require("./settlement-financial.repository");
const {
  createRefundFinancialRepository,
} = require("./refund-financial.repository");
const {
  createFinancialOverviewService,
} = require("./financial-overview.service");
const {
  createFinancialOverviewController,
} = require("./financial-overview.controller");
const { mapFinancialOverview } = require("./financial-overview.mapper");
const timePolicy = require("./time-window.policy");

const getOverview = createFinancialOverviewService({
  bookingRepository: createBookingFinancialRepository({ Booking }),
  settlementRepository: createSettlementFinancialRepository({ Settlement }),
  refundRepository: createRefundFinancialRepository({ Refund }),
  timePolicy,
  mapOverview: mapFinancialOverview,
});

module.exports = {
  getFinancialOverview: createFinancialOverviewController({
    getOverview,
    logger,
  }),
};
