const Booking = require("../../../../models/bookTicketModel.js");

const findPassengerBookingByTicketId = async ({ ticketId, userId }) => {
  return Booking.findOne({
    ticketId,
    userId,
  }).populate("tripId");
};

module.exports = {
  findPassengerBookingByTicketId,
};
