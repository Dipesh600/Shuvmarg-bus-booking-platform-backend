"use strict";

const Trip = require("../../../models/tripModel");
const Snapshot = require("../../../models/tripSeatLayoutSnapshotModel");
const Control = require("../../../models/tripSeatLayoutControlModel");
const Event = require("../../../models/tripSeatLayoutControlEventModel");
const Booking = require("../../../models/bookTicketModel");
const SeatHold = require("../../../models/seatHoldModel");
const { SeatLayoutPersistenceError } = require("./seat-layout-persistence.error");

const findTrip = (id) => Trip.findById(id).select("ownerId busId tripDate departureTime status").lean();
const findSnapshot = (tripId) => Snapshot.findOne({ tripId }).lean();
const findControl = (tripId) => Control.findOne({ tripId }).lean();

function stateMap(snapshot, control) {
  const values = new Map((snapshot.placeStates || []).map((item) => [item.elementId, item.state]));
  (control?.stateOverrides || []).forEach((item) => values.set(item.elementId, item.state));
  return values;
}

function currentPlaceState(snapshot, control, elementId) {
  return stateMap(snapshot, control).get(elementId) || "OPEN";
}

function currentPricing(snapshot, control) {
  return {
    currency: "NPR",
    defaultFare: control?.defaultFareOverride ?? snapshot.pricing?.defaultFare ?? null,
    overrides: control?.fareOverrides?.length ? control.fareOverrides : snapshot.pricing?.overrides || [],
  };
}

function resolve(snapshot, control) {
  const states = stateMap(snapshot, control);
  return {
    tripId: String(snapshot.tripId), fleetId: String(snapshot.fleetId),
    revisionId: String(snapshot.revisionId), layout: snapshot.layout,
    places: Array.from(states, ([elementId, state]) => ({ elementId, state })),
    pricing: currentPricing(snapshot, control), controlVersion: control?.version || 0,
    capturedAt: snapshot.capturedAt,
  };
}

async function findSeatConflict(tripId, seatLabel, activeBookingStatuses, now) {
  const [booking, hold] = await Promise.all([
    Booking.exists({ tripId, status: { $in: activeBookingStatuses }, seats: seatLabel }),
    SeatHold.exists({ tripId, status: { $in: ["held", "processing"] }, expiresAt: { $gt: now }, seatNumbers: seatLabel }),
  ]);
  if (booking) return { type: "BOOKING", seatLabel };
  if (hold) return { type: "ACTIVE_HOLD", seatLabel };
  return null;
}

function mergedStateOverrides(control, elementId, state) {
  const values = new Map((control?.stateOverrides || []).map((item) => [item.elementId, item.state]));
  values.set(elementId, state);
  return Array.from(values, ([id, value]) => ({ elementId: id, state: value }));
}

async function setPlaceState({ trip, control, elementId, state, actorId }) {
  const data = { tripId: trip._id, fleetId: trip.busId, stateOverrides: mergedStateOverrides(control, elementId, state), updatedById: actorId };
  if (!control) return Control.create(data);
  const updated = await Control.findOneAndUpdate(
    { tripId: trip._id, version: control.version },
    { $set: data, $inc: { version: 1 } },
    { new: true, runValidators: true }
  ).lean();
  if (!updated) throw new SeatLayoutPersistenceError("TRIP_SEAT_CONTROL_CHANGED", "Seat controls changed in another session. Refresh and try again.", 409);
  return updated;
}

async function setPricing({ trip, control, defaultFare, overrides, actorId }) {
  const data = { tripId: trip._id, fleetId: trip.busId, defaultFareOverride: defaultFare, fareOverrides: overrides, updatedById: actorId };
  if (!control) return Control.create(data);
  const updated = await Control.findOneAndUpdate(
    { tripId: trip._id, version: control.version },
    { $set: data, $inc: { version: 1 } },
    { new: true, runValidators: true }
  ).lean();
  if (!updated) throw new SeatLayoutPersistenceError("TRIP_SEAT_CONTROL_CHANGED", "Seat controls changed in another session. Refresh and try again.", 409);
  return updated;
}

const recordEvent = ({ trip, ...value }) => Event.create({ tripId: trip._id, fleetId: trip.busId, ...value });

module.exports = {
  findTrip, findSnapshot, findControl, currentPlaceState, currentPricing, resolve,
  findSeatConflict, setPlaceState, setPricing, recordEvent,
};
