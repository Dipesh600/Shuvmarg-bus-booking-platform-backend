const { PassengerBookingCancellationValidationError } = require("./passenger-booking-cancellation-validation.error");

const createPassengerBookingCancellationController = (
  cancellationService,
  cancellationEstimateService
) => {
  const cancelPassengerBooking = async (req, res) => {
    try {
      const { ticketId, cancelReason } = req.body;
      const userId = req.userInfo.id;

      const data = await cancellationService.cancelPassengerBooking(
        ticketId,
        userId,
        cancelReason,
        req.body
      );

      return res.status(200).json({
        status: true,
        message: "Booking cancelled successfully",
        data,
      });
    } catch (error) {
      if (error instanceof PassengerBookingCancellationValidationError) {
        return res.status(error.statusCode).json({
          status: false,
          message: error.message,
        });
      }
      console.error("Cancel Ticket Error:", error);
      return res.status(500).json({
        status: false,
        message: "Internal Server Error",
      });
    }
  };

  const estimatePassengerBookingCancellation = async (req, res) => {
    try {
      const { ticketId } = req.body;
      const userId = req.userInfo.id;

      const data = await cancellationEstimateService.estimatePassengerBookingCancellation(
        ticketId,
        userId
      );

      return res.status(200).json({
        status: true,
        message: "Refund estimate calculated",
        data,
      });
    } catch (error) {
      if (error instanceof PassengerBookingCancellationValidationError) {
        return res.status(error.statusCode).json({
          status: false,
          message: error.message,
        });
      }
      console.error("Cancel Estimate Error:", error);
      return res.status(500).json({
        status: false,
        message: "Failed to calculate refund estimate",
      });
    }
  };

  return { cancelPassengerBooking, estimatePassengerBookingCancellation };
};

module.exports = {
  createPassengerBookingCancellationController,
};
