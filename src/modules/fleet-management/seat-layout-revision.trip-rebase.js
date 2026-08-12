"use strict";

const { projectLegacySeatArrays } = require("../../domain/seat-layout/seat-layout.legacy-projection");

function snapshot(version, capturedAt) {
  return {
    versionNumber: version.versionNumber,
    fingerprint: version.fingerprint,
    totalSeats: version.totalSeats,
    seatConfig: structuredClone(version.seatConfig),
    capturedAt,
  };
}

function mergeSeatState(projected, current) {
  const state = new Map(current.flatMap((group) => group || []).map((seat) => [
    String(seat.seatNo).toLowerCase(), seat,
  ]));
  const merge = (seat) => {
    const old = state.get(String(seat.seatNo).toLowerCase());
    if (!old) return seat;
    return {
      ...seat,
      booked: old.booked === true,
      bookedBy: old.bookedBy || null,
      bookedAt: old.bookedAt || null,
      blockedFor: old.blockedFor === "layout_change" ? "none" : (old.blockedFor || "none"),
      blockedByLayoutRevisionId: null,
    };
  };
  return Object.fromEntries(Object.entries(projected).map(([key, seats]) => [key, seats.map(merge)]));
}

function createTripRebaseService({ Trip, Seat, clock = () => new Date() }) {
  async function stage(tripIds, version, effectiveAt) {
    if (!tripIds.length) return;
    await Trip.updateMany({ _id: { $in: tripIds } }, {
      nextSeatLayoutVersionId: version._id,
      nextSeatLayoutSnapshot: snapshot(version, clock()),
      seatLayoutEffectiveAt: effectiveAt,
    });
  }

  async function unstage(tripIds, versionId) {
    if (!tripIds.length) return;
    await Trip.updateMany({ _id: { $in: tripIds }, nextSeatLayoutVersionId: versionId }, {
      $set: { nextSeatLayoutVersionId: null, seatLayoutEffectiveAt: null },
      $unset: { nextSeatLayoutSnapshot: 1 },
    });
  }

  async function applyTrip(trip, version) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const seatDoc = await Seat.findOne({ tripId: trip._id }).lean();
      if (!seatDoc) throw new Error(`Seat inventory missing for trip ${trip._id}.`);
      const arrays = mergeSeatState(
        projectLegacySeatArrays(version.seatConfig),
        [seatDoc.seata, seatDoc.seatb, seatDoc.seatc]
      );
      const result = await Seat.updateOne(
        { _id: seatDoc._id, updatedAt: seatDoc.updatedAt },
        { $set: arrays }
      );
      if (result.modifiedCount) {
        await Trip.collection.updateOne({ _id: trip._id }, {
          $set: {
            seatLayoutVersionId: version._id,
            seatLayoutSnapshot: trip.nextSeatLayoutSnapshot,
            nextSeatLayoutVersionId: null,
            seatLayoutEffectiveAt: null,
          },
          $unset: { nextSeatLayoutSnapshot: "" },
        });
        return;
      }
    }
    throw new Error(`Seat inventory changed while applying layout to trip ${trip._id}.`);
  }

  async function applyDue(fleetId, version, now) {
    const trips = await Trip.find({
      busId: fleetId,
      nextSeatLayoutVersionId: version._id,
      seatLayoutEffectiveAt: { $lte: now },
      status: { $in: ["scheduled", "boarding"] },
    }).lean();
    for (const trip of trips) await applyTrip(trip, version);
    return trips.length;
  }

  return { stage, unstage, applyDue };
}

module.exports = { createTripRebaseService, mergeSeatState };
