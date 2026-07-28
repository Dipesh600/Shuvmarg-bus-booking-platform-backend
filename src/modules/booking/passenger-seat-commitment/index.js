'use strict';

/**
 * src/modules/booking/passenger-seat-commitment/index.js
 * Production entrypoint for passenger seat commitment module.
 */

const Seat = require('../../../../models/seatsModel.js');
const logger = require('../../../../utils/logger.js');
const {
  createPassengerSeatCommitmentRepository,
} = require('./passenger-seat-commitment.repository.js');
const mapper = require('./passenger-seat-commitment.mapper.js');
const {
  createPassengerSeatCommitmentService,
} = require('./passenger-seat-commitment.service.js');
const {
  createPassengerSeatRollbackRepository,
} = require('./passenger-seat-rollback.repository.js');
const {
  createPassengerSeatRollbackService,
} = require('./passenger-seat-rollback.service.js');

const repository = createPassengerSeatCommitmentRepository({
  Seat,
});

const service = createPassengerSeatCommitmentService({
  repository,
  mapper,
  createDate: () => new Date(),
});

const rollbackRepository = createPassengerSeatRollbackRepository({
  Seat,
});

const rollbackService = createPassengerSeatRollbackService({
  repository: rollbackRepository,
  logger,
});

module.exports = {
  commitPassengerSeats: service.commitPassengerSeats,
  rollbackPassengerSeatLocks: rollbackService.rollbackPassengerSeatLocks,
};
