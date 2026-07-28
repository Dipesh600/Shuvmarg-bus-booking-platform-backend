'use strict';

function createPassengerEsewaCheckoutController({ service, mapper }) {
  async function initiatePassengerEsewaCheckout(req, res) {
    try {
      const result = await service.initiate({
        userId: req.dbUser._id,
        activeRole: req.userInfo.activeRole,
        hold: req.bookingHold,
        body: req.body,
      });
      return res.status(result.statusCode).json(result.body);
    } catch (error) {
      const result = mapper.mapError(error);
      return res.status(result.statusCode).json(result.body);
    }
  }

  async function finalizePassengerEsewaCheckout(req, res) {
    try {
      const result = await service.finalize({
        userId: req.dbUser._id,
        activeRole: req.userInfo.activeRole,
        transactionUuid: req.body?.transactionUuid,
        responseData: req.body?.responseData,
      });
      return res.status(result.statusCode).json(result.body);
    } catch (error) {
      const result = mapper.mapError(error);
      return res.status(result.statusCode).json(result.body);
    }
  }

  return {
    initiatePassengerEsewaCheckout,
    finalizePassengerEsewaCheckout,
  };
}

module.exports = { createPassengerEsewaCheckoutController };
