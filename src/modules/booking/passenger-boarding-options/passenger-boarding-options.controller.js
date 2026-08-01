"use strict";

function createPassengerBoardingOptionsController(service) {
  return async function getPassengerBoardingOptions(req, res) {
    try {
      const data = await service({
        tripId: req.params.tripId,
        originStopId: req.query.originStopId,
        destinationStopId: req.query.destinationStopId,
        originSelectionStopId: req.query.originSelectionStopId,
        destinationSelectionStopId: req.query.destinationSelectionStopId,
      });
      return res.status(200).json({ success: true, data });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      return res.status(statusCode).json({
        success: false,
        code: error.code || "BOARDING_OPTIONS_ERROR",
        errorCode: error.code || "BOARDING_OPTIONS_ERROR",
        message: statusCode === 500
          ? "Boarding options could not be loaded."
          : error.message,
        details: error.details,
      });
    }
  };
}

module.exports = { createPassengerBoardingOptionsController };
