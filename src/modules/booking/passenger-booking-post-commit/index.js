'use strict';

/**
 * Production composition for passenger booking post-commit side effects.
 */
const CouponHelper = require('../../../../handlers/couponHelper');
const SMLedger = require('../../../../models/smLedgerModel');
const smLedgerService = require('../../wallet/sm-ledger');
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
  bookingConfirmation: { ...bookingConfirmation, sendBookingConfirmedNotification: async params => {
    if (!params.durableBookingId) return bookingConfirmation.sendBookingConfirmedNotification(params);
    const job = await require("../../../../models/bookingNotificationJobModel").findOne({ _id: params.durableBookingId, userId: params.userId });
    if (job) return require("../../../../services/bookingNotificationRecovery").deliverBookingNotification(job._id);
    return bookingConfirmation.sendBookingConfirmedNotification(params);
  } },
  logger,
});

module.exports = {
  buildPassengerCommittedBookingResponse:
    service.buildPassengerCommittedBookingResponse,
  completePassengerBookingPostCommit:
    service.completePassengerBookingPostCommit,
};
