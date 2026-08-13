"use strict";

const mongoose = require("mongoose");
const Trip = require("../../../models/tripModel");
const Seat = require("../../../models/seatsModel");
const Assignment = require("../../../models/fleetSeatLayoutAssignmentModel");

async function runTransaction(work) {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => { result = await work(session); });
    return result;
  } finally {
    await session.endSession();
  }
}

async function createTrip(data, session) {
  const [trip] = await Trip.create([data], { session });
  return trip;
}

async function createLegacySeats(data, session) {
  const [seats] = await Seat.create([data], { session });
  return seats;
}

const hasV3Assignment = (fleetId, session) => Assignment.exists({ fleetId }).session(session);

module.exports = { runTransaction, createTrip, createLegacySeats, hasV3Assignment };
