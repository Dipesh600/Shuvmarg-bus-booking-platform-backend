"use strict";

const createReferralUnlockService = ({
  Booking,
  loadUser,
  loadReferralService,
  logger,
}) => {
  const processCompletion = async (tripId) => {
    try {
      const referralService = loadReferralService();
      const User = loadUser();
      const bookings = await Booking.find({
        tripId,
        status: "booked",
      })
        .select("_id userId totalAmount")
        .lean();
      for (const booking of bookings) {
        try {
          const user = await User.findById(booking.userId)
            .select("referredBy")
            .lean();
          if (user?.referredBy) {
            const result = await referralService.processJourneyCompletion(
              booking.userId,
              booking._id
            );
            if (result) {
              logger.info("Referral unlock processed", {
                referredUserId: booking.userId,
                bookingId: booking._id,
                journeyNumber: result.journeyNumber,
                amountUnlocked: result.amountUnlocked,
              });
            }
          }
        } catch (error) {
          logger.error("Referral unlock failed for booking (non-blocking)", {
            bookingId: booking._id,
            userId: booking.userId,
            error: error.message,
          });
        }
      }
    } catch (error) {
      logger.error("Referral unlock batch failed (non-blocking)", {
        tripId,
        error: error.message,
      });
    }
  };
  return { processCompletion };
};

module.exports = { createReferralUnlockService };
