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
const { validateConfirmationHold, completePassengerHold } = require('./require-passenger-seat-hold.service');
const { requireOwnedActivePassengerSeatHold } = require('./passenger-seat-hold.middleware');

module.exports = {
  policy,
  errors,
  repository,
  normalizeSeatNumbers: policy.normalizeSeatNumbers,
  createOrReusePassengerSeatHold,
  validateConfirmationHold,
  completePassengerHold,
  requireOwnedActivePassengerSeatHold,
};
