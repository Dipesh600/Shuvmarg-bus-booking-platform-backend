const respond = require("../../../shared/http/respond");
const service = require("./verify-booking.service");

const verifyBooking = async (req, res) => {
  try {
    const ticketId = req.params.ticketId;
    const userId = req.userInfo.id;

    const result = await service.verifyPassengerBooking({ ticketId, userId });

    return respond(res, result.statusCode, result.responseBody);
  } catch (error) {
    console.error("Error verifying booking:", error);
    return respond(res, 500, {
      success: false,
      message: "Internal Server Error!",
    });
  }
};

module.exports = {
  verifyBooking,
};
