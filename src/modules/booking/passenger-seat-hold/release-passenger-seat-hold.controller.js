'use strict';

function createReleasePassengerSeatHoldController({ service }) {
  return async function releasePassengerSeatHold(req, res, next) {
    try {
      const result = await service({
        tempBookingId: req.body?.tempBookingId,
        userId: req.dbUser?._id,
      });
      return res.status(result.statusCode).json(result.body);
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = {
  createReleasePassengerSeatHoldController,
};
