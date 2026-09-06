'use strict';

const Booking = require('../../../../models/bookTicketModel.js');
const { generateBookingTicketId } = require('../booking-confirmation');
const { createPassengerBookingPersistenceRepository } = require('./passenger-booking-persistence.repository.js');
const mapper = require('./passenger-booking-persistence.mapper.js');
const { createPassengerBookingPersistenceService } = require('./passenger-booking-persistence.service.js');
const agentMapper = require('./agent-cash-booking-persistence.mapper.js');
const { createAgentCashBookingPersistenceService } = require('./agent-cash-booking-persistence.service.js');

const repository = createPassengerBookingPersistenceRepository({ Booking,
  commitPaymentBooking: require("../../../shared/commit-payment-booking").commitPaymentBooking,
  captureRefundPolicySnapshot: require("../../../shared/refund-policy-snapshot").captureRefundPolicySnapshot });
const service = createPassengerBookingPersistenceService({
  repository,
  mapper,
  generateTicketId: generateBookingTicketId,
  createTimestamp: () => Date.now(),
});
const agentService = createAgentCashBookingPersistenceService({
  repository,
  mapper: agentMapper,
  generateTicketId: generateBookingTicketId,
});

module.exports = {
  persistPassengerBooking: (params) => service.persistPassengerBooking(params),
  persistAgentCashBooking: agentService.persistAgentCashBooking,
};
