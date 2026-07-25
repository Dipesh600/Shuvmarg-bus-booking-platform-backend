function createPassengerBookingPreparationController({ service }) {
  return {
    async preparePassengerBooking(req, res, next) {
      try {
        if (!req.body || Object.keys(req.body).length === 0) {
          return res.status(400).json({
            success: false,
            message: "your body is empty please add",
          });
        }

        const { scheduleId, seatNumbers, originalAmount, couponCode, smMoneyToUse } = req.body;
        const userId = req.dbUser._id;
        const activeRole = req.userInfo.activeRole;

        const result = await service.preparePassengerBooking({
          scheduleId,
          seatNumbers,
          originalAmount,
          couponCode,
          smMoneyToUse,
          userId,
          activeRole,
        });

        return res.status(result.statusCode).json(result.body);
      } catch (error) {
        if (error.statusCode) return next(error);
        console.error("Error preparing booking:", error);
        return res.status(500).json({
          success: false,
          message: "Internal Server Error!",
        });
      }
    },
  };
}

module.exports = {
  createPassengerBookingPreparationController,
};
