const notificationManagerApi = require("../../../../controllers/notificationController/notification_manager");

const createPassengerBookingCancellationNotificationService = (repository) => {
  const sendCancellationNotifications = async (userId, booking, estimate) => {
    try {
      const tripDetails = await repository.findTripByIdWithRoute(booking.tripId);
      const routeInfo = tripDetails?.routeId
        ? `${tripDetails.routeId.from} to ${tripDetails.routeId.to}`
        : "Route information not available";

      await notificationManagerApi.createLocalNotification(
        userId,
        "TICKET_CANCELLED",
        "Booking Cancelled",
        `Your booking (${booking.ticketId}) for ${routeInfo} has been cancelled. Refund of NPR ${estimate.refundAmount} is being processed.`,
        {
          tripId: booking.tripId,
          seats: booking.seats,
          ticketId: booking.ticketId,
          route: routeInfo,
          refundAmount: estimate.refundAmount,
        }
      );

      const userDevices = await repository.findUserDevices(userId);
      const tokens = userDevices.map((device) => device.token).filter(Boolean);
      if (tokens.length > 0) {
        await notificationManagerApi.notificationManager(
          tokens,
          "Booking Cancelled",
          `Your booking (${booking.ticketId}) for ${routeInfo} has been cancelled. Refund: NPR ${estimate.refundAmount}.`
        );
      }
    } catch (notifyErr) {
      console.error("Error sending cancellation notifications:", notifyErr);
    }
  };

  return { sendCancellationNotifications };
};

module.exports = {
  createPassengerBookingCancellationNotificationService,
};
