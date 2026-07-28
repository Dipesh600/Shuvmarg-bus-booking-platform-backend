const Seat = require("../../../../models/seatsModel");
const Trip = require("../../../../models/tripModel");
const SeatHold = require("../../../../models/seatHoldModel");

const findSeatByTripId = async (tripId) => {
  return Seat.findOne({ tripId: tripId }).lean();
};

const findTripWithSeatConfig = async (tripId) => {
  return Trip.findById(tripId).populate("seatTemplateId busId");
};

const findActiveSeatHolds = async (tripId, currentUserId) => {
  const query = {
    tripId: tripId,
    status: { $in: ["held", "processing"] },
    expiresAt: { $gt: new Date() }
  };
  
  if (currentUserId) {
    query.userId = { $ne: currentUserId };
  }
  
  return SeatHold.find(query);
};

module.exports = {
  findSeatByTripId,
  findTripWithSeatConfig,
  findActiveSeatHolds
};
