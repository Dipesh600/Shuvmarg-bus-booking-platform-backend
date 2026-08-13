"use strict";

const { SeatLayoutPersistenceError } = require("./seat-layout-persistence.error");

const WITHDRAWAL_NOTICE_MS = 7 * 24 * 60 * 60 * 1000;
const ACTIVE_BOOKING_STATUSES = ["booked", "pending"];

function sameId(first, second) { return String(first) === String(second); }

function departureAt(trip) {
  const day = new Date(trip.tripDate);
  const match = /^(\d{1,2}):(\d{2})$/.exec(trip.departureTime || "");
  if (!Number.isFinite(day.getTime()) || !match) return null;
  const nepalOffsetMinutes = 5 * 60 + 45;
  return new Date(Date.UTC(
    day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(),
    Number(match[1]), Number(match[2])
  ) - nepalOffsetMinutes * 60 * 1000);
}

function places(snapshot) {
  return snapshot.layout.sections.flatMap((section) => section.elements)
    .filter((element) => ["SEAT", "BERTH"].includes(element.kind));
}

function requirePlace(snapshot, elementId) {
  const place = places(snapshot).find((item) => item.elementId === elementId);
  if (!place) throw new SeatLayoutPersistenceError("TRIP_SEAT_PLACE_NOT_FOUND", "This passenger place does not exist in the trip layout.", 404);
  return place;
}

function validateFare(value, field) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new SeatLayoutPersistenceError("TRIP_SEAT_FARE_INVALID", `${field} must be greater than zero.`, 422);
  }
  return value;
}

function createTripSeatLayoutControlService(repository, clock = () => new Date()) {
  async function context(tripId, actor) {
    if (!actor?.id) throw new SeatLayoutPersistenceError("TRIP_SEAT_CONTROL_UNAUTHENTICATED", "Authentication is required.", 401);
    const trip = await repository.findTrip(tripId);
    if (!trip) throw new SeatLayoutPersistenceError("TRIP_NOT_FOUND", "Trip not found.", 404);
    if (!sameId(trip.ownerId, actor.id)) throw new SeatLayoutPersistenceError("TRIP_SEAT_CONTROL_FORBIDDEN", "This trip belongs to another operator.", 403);
    const snapshot = await repository.findSnapshot(tripId);
    if (!snapshot) throw new SeatLayoutPersistenceError("TRIP_SEAT_LAYOUT_NOT_CAPTURED", "This trip has no V3 seat-layout snapshot.", 409);
    return { trip, snapshot, control: await repository.findControl(tripId) };
  }

  async function get(tripId, actor) {
    const value = await context(tripId, actor);
    return repository.resolve(value.snapshot, value.control);
  }

  async function changePlaceState(tripId, elementId, input, actor) {
    const requested = input?.state;
    if (!["OPEN", "WITHDRAWN"].includes(requested)) throw new SeatLayoutPersistenceError("TRIP_SEAT_STATE_INVALID", "State must be OPEN or WITHDRAWN.", 422);
    const value = await context(tripId, actor);
    if (value.trip.status !== "scheduled") throw new SeatLayoutPersistenceError("TRIP_SEAT_CONTROL_CLOSED", "Seats can only be managed while the trip is scheduled.", 409);
    const place = requirePlace(value.snapshot, elementId);
    const current = repository.currentPlaceState(value.snapshot, value.control, elementId);
    if (current === requested) return repository.resolve(value.snapshot, value.control);

    if (requested === "WITHDRAWN") {
      const departure = departureAt(value.trip);
      if (!departure || departure.getTime() - clock().getTime() < WITHDRAWAL_NOTICE_MS) {
        throw new SeatLayoutPersistenceError("TRIP_SEAT_WITHDRAWAL_TOO_LATE", "A passenger place can only be withdrawn at least 7 days before departure.", 409);
      }
      const conflict = await repository.findSeatConflict(tripId, place.label, ACTIVE_BOOKING_STATUSES, clock());
      if (conflict) throw new SeatLayoutPersistenceError("TRIP_SEAT_WITHDRAWAL_CONFLICT", "This place has an active booking or hold and cannot be withdrawn.", 409, conflict);
    }

    const reason = typeof input?.reason === "string" ? input.reason.trim() : "";
    if (requested === "WITHDRAWN" && reason.length < 3) throw new SeatLayoutPersistenceError("TRIP_SEAT_WITHDRAWAL_REASON_REQUIRED", "Give a short reason for withdrawing this place.", 422);
    const control = await repository.setPlaceState({ trip: value.trip, control: value.control, elementId, state: requested, actorId: actor.id });
    await repository.recordEvent({ trip: value.trip, action: requested === "OPEN" ? "PLACE_OPENED" : "PLACE_WITHDRAWN", elementId, before: current, after: requested, reason: reason || null, actorId: actor.id });
    return repository.resolve(value.snapshot, control);
  }

  async function changePricing(tripId, input, actor) {
    const value = await context(tripId, actor);
    if (value.trip.status !== "scheduled") throw new SeatLayoutPersistenceError("TRIP_SEAT_CONTROL_CLOSED", "Fares can only be managed while the trip is scheduled.", 409);
    const placeIds = new Set(places(value.snapshot).map((place) => place.elementId));
    const defaultFare = validateFare(input?.defaultFare, "Default fare");
    const seen = new Set();
    const overrides = (input?.overrides || []).map((item) => {
      if (!placeIds.has(item?.elementId) || seen.has(item.elementId)) throw new SeatLayoutPersistenceError("TRIP_SEAT_FARE_OVERRIDE_INVALID", "Each override must target one unique passenger place.", 422);
      seen.add(item.elementId);
      return { elementId: item.elementId, fare: validateFare(item.fare, "Seat fare") };
    });
    const control = await repository.setPricing({ trip: value.trip, control: value.control, defaultFare, overrides, actorId: actor.id });
    await repository.recordEvent({ trip: value.trip, action: "PRICING_CHANGED", before: repository.currentPricing(value.snapshot, value.control), after: { defaultFare, overrides }, actorId: actor.id });
    return repository.resolve(value.snapshot, control);
  }

  return { get, changePlaceState, changePricing };
}

module.exports = { createTripSeatLayoutControlService, departureAt, WITHDRAWAL_NOTICE_MS };
