'use strict';

/**
 * src/modules/booking/passenger-seat-hold/index.js
 *
 * Public barrel for the passenger seat hold domain module.
 */

const policy = require('./passenger-seat-hold.policy');
const errors = require('./passenger-seat-hold.errors');
const repository = require('./passenger-seat-hold.repository');
const { createOrReusePassengerSeatHold } = require('./create-passenger-seat-hold.service');
const {
  validateConfirmationHold,
  completePassengerHold,
  claimPassengerHoldForConfirmation,
  restorePassengerHoldAfterFailedConfirmation,
} = require('./require-passenger-seat-hold.service');
const { requireOwnedActivePassengerSeatHold } = require('./passenger-seat-hold.middleware');
const {
  createReleasePassengerSeatHoldService,
} = require('./release-passenger-seat-hold.service');
const {
  createReleasePassengerSeatHoldController,
} = require('./release-passenger-seat-hold.controller');

const releaseService = createReleasePassengerSeatHoldService({
  repository,
  clock: () => new Date(),
});
const releasePassengerSeatHold = createReleasePassengerSeatHoldController({
  service: releaseService,
});

module.exports = {
  policy,
  errors,
  repository,
  normalizeSeatNumbers: policy.normalizeSeatNumbers,
  createOrReusePassengerSeatHold,
  validateConfirmationHold,
  completePassengerHold,
  claimPassengerHoldForConfirmation,
  restorePassengerHoldAfterFailedConfirmation,
  requireOwnedActivePassengerSeatHold,
  releasePassengerSeatHold,
};
