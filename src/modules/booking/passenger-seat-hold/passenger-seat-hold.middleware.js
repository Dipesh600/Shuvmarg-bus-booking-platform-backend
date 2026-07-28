'use strict';

/**
 * src/modules/booking/passenger-seat-hold/passenger-seat-hold.middleware.js
 *
 * Middleware to enforce owned active seat hold before confirmation.
 */

const { validateConfirmationHold } = require('./require-passenger-seat-hold.service');

const requireOwnedActivePassengerSeatHold = async (req, res, next) => {
  try {
    const tempBookingId = req.body?.tempBookingId;
    const userId = req.dbUser?._id;
    const clientTripId = req.body?.scheduleId;
    const clientSeats = req.body?.seatNumbers;

    const canonicalHold = await validateConfirmationHold({
      tempBookingId,
      userId,
      clientTripId,
      clientSeats,
      now: new Date(),
    });

    req.bookingHold = canonicalHold;
    return next();
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  requireOwnedActivePassengerSeatHold,
};
