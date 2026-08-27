'use strict';

const { filterSellableTrips } = require('../../../shared/identity/agent-selling-guard');
const { isAgentVerificationCleared } = require('../../../shared/identity/agent-verification');
const passengerSeatHold = require('../../booking/passenger-seat-hold');
const preparationPolicy = require('../../booking/passenger-booking-preparation/passenger-booking-preparation.policy');
const errors = require('./agent-seat-hold.errors');
const mapper = require('./agent-seat-hold.mapper');
const parse = require('./agent-seat-hold.parse');
const repository = require('./agent-seat-hold.repository');
const { createAgentSeatHoldService } = require('./agent-seat-hold.service');
const { createController } = require('./agent-seat-hold.controller');

const service = createAgentSeatHoldService({
  clock: () => new Date(),
  errors,
  filterSellableTrips,
  isAgentVerificationCleared,
  mapper,
  parse,
  passengerSeatHold,
  preparationPolicy,
  repository,
});

module.exports = { createHold: createController(service) };
