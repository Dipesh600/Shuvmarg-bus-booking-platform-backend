"use strict";

const { ApiError } = require("../../contracts");

const ACTIVE_TRIP_STATUSES = ["scheduled", "boarding"];

function labelVariants(seatLabels) {
  return [...new Set(seatLabels.flatMap((label) => {
    const value = String(label);
    return [value, value.toLowerCase(), value.toUpperCase()];
  }))];
}

function createConflictService({ Trip, Booking, SeatHold, Seat, clock = () => new Date() }) {
  async function affectedTrips(fleetId, effectiveAt) {
    return Trip.find({
      busId: fleetId,
      tripDate: { $gte: effectiveAt },
      status: { $in: ACTIVE_TRIP_STATUSES },
    }).distinct("_id");
  }

  async function assertSeatsClear(fleetId, effectiveAt, seatLabels) {
    const tripIds = await affectedTrips(fleetId, effectiveAt);
    if (!tripIds.length || !seatLabels.length) return { tripIds, bookingCount: 0, holdCount: 0 };
    const labels = labelVariants(seatLabels);
    const [bookingCount, holdCount] = await Promise.all([
      Booking.countDocuments({
        tripId: { $in: tripIds }, status: { $in: ["booked", "pending"] },
        seats: { $in: labels },
      }),
      SeatHold.countDocuments({
        tripId: { $in: tripIds }, status: { $in: ["held", "processing"] },
        expiresAt: { $gt: clock() }, seatNumbers: { $in: labels },
      }),
    ]);
    if (bookingCount || holdCount) {
      throw new ApiError("FLEET_LAYOUT_CHANGE_BLOCKED", {
        details: { bookingCount, holdCount, affectedTripCount: tripIds.length, seatLabels },
      });
    }
    return { tripIds, bookingCount, holdCount };
  }

  async function blockSeats(tripIds, seatLabels, revisionId) {
    if (!tripIds.length || !seatLabels.length) return;
    const labels = labelVariants(seatLabels);
    for (const field of ["seata", "seatb", "seatc"]) {
      await Seat.updateMany(
        { tripId: { $in: tripIds }, [`${field}.seatNo`]: { $in: labels } },
        { $set: {
          [`${field}.$[seat].blockedFor`]: "layout_change",
          [`${field}.$[seat].blockedByLayoutRevisionId`]: revisionId,
        } },
        { arrayFilters: [{
          "seat.seatNo": { $in: labels },
          "seat.booked": false,
          $or: [{ "seat.blockedFor": "none" }, { "seat.blockedFor": { $exists: false } }],
        }] }
      );
    }
  }

  async function unblockSeats(tripIds, revisionId) {
    if (!tripIds.length) return;
    for (const field of ["seata", "seatb", "seatc"]) {
      await Seat.updateMany(
        { tripId: { $in: tripIds }, [`${field}.blockedByLayoutRevisionId`]: revisionId },
        { $set: {
          [`${field}.$[seat].blockedFor`]: "none",
          [`${field}.$[seat].blockedByLayoutRevisionId`]: null,
        } },
        { arrayFilters: [{ "seat.blockedByLayoutRevisionId": revisionId }] }
      );
    }
  }

  return { affectedTrips, assertSeatsClear, blockSeats, unblockSeats };
}

module.exports = { createConflictService, ACTIVE_TRIP_STATUSES, labelVariants };
