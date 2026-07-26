'use strict';

/**
 * Production composition for passenger booking post-commit side effects.
 */
const CouponHelper = require('../../../../handlers/couponHelper');
const SMLedger = require('../../../../models/smLedgerModel');
const smLedgerService = require('../../../../services/smLedgerService');
const logger = require('../../../../utils/logger');
const passengerSeatHold = require('../passenger-seat-hold');
const bookingConfirmation = require('../booking-confirmation');
const {
  createPassengerBookingPostCommitService,
} = require('./passenger-booking-post-commit.service');

const service = createPassengerBookingPostCommitService({
  passengerSeatHold,
  SMLedger,
  CouponHelper,
  smLedgerService,
  bookingConfirmation,
  logger,
});

module.exports = {
  buildPassengerCommittedBookingResponse:
    service.buildPassengerCommittedBookingResponse,
  completePassengerBookingPostCommit:
    service.completePassengerBookingPostCommit,
};
