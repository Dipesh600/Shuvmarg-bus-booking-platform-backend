'use strict';

const mongoose = require('mongoose');
const bookingPersistence = require('../../booking/passenger-booking-persistence');
const passengerSeatHold = require('../../booking/passenger-seat-hold');
const seatCommitment = require('../../booking/passenger-seat-commitment');
const compensation = require('./agent-cash-sale.compensation');
const errors = require('./agent-cash-sale.errors');
const mapper = require('./agent-cash-sale.mapper');
const parse = require('./agent-cash-sale.parse');
const repository = require('./agent-cash-sale.repository');
const { createAgentCashSaleService } = require('./agent-cash-sale.service');
const { createController } = require('./agent-cash-sale.controller');

const service = createAgentCashSaleService({
  bookingPersistence,
  clock: () => new Date(),
  compensate: compensation.compensate,
  createId: () => new mongoose.Types.ObjectId(),
  errors,
  mapper,
  parse,
  passengerSeatHold,
  repository,
  seatCommitment,
});

module.exports = { commitSale: createController(service) };
