'use strict';

const toResponse = (hold) => ({
  success: true,
  data: {
    holdId: hold._id,
    tripId: hold.tripId,
    seatNumbers: hold.seatNumbers,
    expiresAt: hold.expiresAt,
    originalAmount: hold.originalAmount,
    status: hold.status,
  },
});

module.exports = { toResponse };
