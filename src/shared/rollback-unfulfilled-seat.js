"use strict";
const mongoose = require("mongoose");
const Trip = require("../../models/tripModel");
const Booking = require("../../models/bookTicketModel");
const Seat = require("../../models/seatsModel");
const { withMongoTransaction } = require("./with-mongo-transaction");

async function rollbackUnfulfilledSeat({ tripId, arrayField, seatNo, userId }) {
  if (!["seata", "seatb", "seatc"].includes(arrayField)) throw new Error("Invalid seat section");
  return withMongoTransaction(mongoose, null, async session => {
    // Booking commit and cancellation write this same trip, serializing the check and release.
    await Trip.updateOne({ _id: tripId }, { $inc: { paymentCommitSequence: 1 } }, { session });
    const seatPattern = new RegExp(`^${String(seatNo).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
    if (await Booking.exists({ tripId, status: "booked", seats: seatPattern }).session(session)) return { protected: true };
    return Seat.findOneAndUpdate({ tripId, [arrayField]: { $elemMatch: { seatNo, bookedBy: userId } } },
      { $set: { [`${arrayField}.$[elem].booked`]: false, [`${arrayField}.$[elem].bookedBy`]: null,
        [`${arrayField}.$[elem].bookedAt`]: null } },
      { session, arrayFilters: [{ "elem.seatNo": seatNo, "elem.bookedBy": userId }] });
  });
}

module.exports = { rollbackUnfulfilledSeat };
