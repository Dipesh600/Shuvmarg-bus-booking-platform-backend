const Seat = require("../../../../models/seatsModel");
const Trip = require("../../../../models/tripModel");
const SeatHold = require("../../../../models/seatHoldModel");
const Booking = require("../../../../models/bookTicketModel");
const Snapshot = require("../../../../models/tripSeatLayoutSnapshotModel");
const Control = require("../../../../models/tripSeatLayoutControlModel");

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

const findV3Snapshot = (tripId) => Snapshot.findOne({ tripId }).lean();
const findV3Control = (tripId) => Control.findOne({ tripId }).lean();
const findActiveBookedSeatLabels = async (tripId) => {
  const rows = await Booking.find({ tripId, status: { $in: ["booked", "pending"] } }).select("seats").lean();
  return rows.flatMap((row) => row.seats || []);
};

module.exports = {
  findSeatByTripId,
  findTripWithSeatConfig,
  findActiveSeatHolds,
  findV3Snapshot,
  findV3Control,
  findActiveBookedSeatLabels,
};
