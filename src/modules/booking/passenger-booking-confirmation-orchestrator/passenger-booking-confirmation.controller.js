'use strict';

function createPassengerBookingConfirmationController({
  orchestratePassengerBookingConfirmation,
}) {
  return async function confirmPassengerBooking(req, res) {
    const result = await orchestratePassengerBookingConfirmation({ req, res });
    if (!result || res.headersSent) return;
    return res.status(result.statusCode).json(result.body);
  };
}

module.exports = {
  createPassengerBookingConfirmationController,
};
