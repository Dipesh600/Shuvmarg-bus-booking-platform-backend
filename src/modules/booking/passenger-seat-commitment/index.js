'use strict';

/**
 * src/modules/booking/passenger-seat-commitment/index.js
 * Production entrypoint for passenger seat commitment module.
 */

const Seat = require('../../../../models/seatsModel.js');
const {
  createPassengerSeatCommitmentRepository,
} = require('./passenger-seat-commitment.repository.js');
const mapper = require('./passenger-seat-commitment.mapper.js');
const {
  createPassengerSeatCommitmentService,
} = require('./passenger-seat-commitment.service.js');

const repository = createPassengerSeatCommitmentRepository({
  Seat,
});

const service = createPassengerSeatCommitmentService({
  repository,
  mapper,
  createDate: () => new Date(),
});

module.exports = {
  commitPassengerSeats: service.commitPassengerSeats,
};
