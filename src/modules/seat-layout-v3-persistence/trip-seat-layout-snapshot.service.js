"use strict";

const { validateSeatLayoutV3, seatLayoutV3Fingerprint } = require("../../domain/seat-layout-v3");
const policy = require("./seat-layout-persistence.policy");
const { SeatLayoutPersistenceError } = require("./seat-layout-persistence.error");

function reservableIds(layout) {
  return layout.sections.flatMap((section) => section.elements)
    .filter((element) => ["SEAT", "BERTH"].includes(element.kind))
    .map((element) => element.elementId);
}

function buildPricing(placeIds, pricing) {
  if (pricing?.defaultFare === null || pricing?.defaultFare === undefined) {
    if (pricing?.overrides?.length) {
      throw new SeatLayoutPersistenceError(
        "SEAT_LAYOUT_FARE_OVERRIDE_INVALID", "Fare overrides require a default fare.", 422
      );
    }
    return { currency: "NPR", status: "UNPRICED", defaultFare: null, overrides: [] };
  }
  if (!Number.isFinite(pricing.defaultFare) || pricing.defaultFare < 0) {
    throw new SeatLayoutPersistenceError("SEAT_LAYOUT_FARE_INVALID", "A non-negative default fare is required.", 422);
  }
  const seen = new Set();
  const overrides = (pricing.overrides || []).map((item) => {
    if (!placeIds.has(item.elementId) || seen.has(item.elementId)
      || !Number.isFinite(item.fare) || item.fare < 0) {
      throw new SeatLayoutPersistenceError(
        "SEAT_LAYOUT_FARE_OVERRIDE_INVALID", "Every fare override must target one unique passenger place.", 422
      );
    }
    seen.add(item.elementId);
    return { elementId: item.elementId, fare: item.fare };
  });
  return { currency: "NPR", status: "PRICED", defaultFare: pricing.defaultFare, overrides };
}

function buildStates(placeIds, unavailableElementIds = []) {
  const unavailable = new Set(unavailableElementIds);
  if (unavailable.size !== unavailableElementIds.length
    || Array.from(unavailable).some((id) => !placeIds.has(id))) {
    throw new SeatLayoutPersistenceError(
      "SEAT_LAYOUT_AVAILABILITY_INVALID", "Unavailable places must be unique IDs from the assigned layout.", 422
    );
  }
  return Array.from(placeIds, (elementId) => ({
    elementId, state: unavailable.has(elementId) ? "WITHDRAWN" : "OPEN",
  }));
}

function createTripSeatLayoutSnapshotService(repository) {
  async function capture(tripId, options) {
    const trip = policy.requireRecord(
      await repository.findTrip(tripId, options?.session), "TRIP_NOT_FOUND", "Trip not found."
    );
    if (await repository.findSnapshot(tripId, options?.session)) {
      throw new SeatLayoutPersistenceError(
        "TRIP_SEAT_LAYOUT_ALREADY_CAPTURED", "This trip already has an immutable seat-layout snapshot."
      );
    }
    const assignment = policy.requireRecord(
      await repository.findAssignment(trip.busId, options?.session),
      "FLEET_LAYOUT_ASSIGNMENT_NOT_FOUND", "The trip fleet has no published seat-layout assignment."
    );
    const revision = policy.requireRecord(
      await repository.findRevision(assignment.activeRevisionId, options?.session),
      "SEAT_LAYOUT_REVISION_NOT_FOUND", "The assigned layout revision no longer exists."
    );
    if (!["PUBLISHED", "RETIRED"].includes(revision.status)) {
      throw new SeatLayoutPersistenceError(
        "SEAT_LAYOUT_REVISION_NOT_ASSIGNABLE",
        "Trip snapshots require a published revision or a retired revision already assigned to the fleet."
      );
    }
    const { layout } = validateSeatLayoutV3(revision.layout);
    const ids = new Set(reservableIds(layout));
    return repository.createSnapshot({
      tripId: trip._id, fleetId: trip.busId, templateId: revision.templateId,
      revisionId: revision._id, sourceAssignmentVersion: assignment.assignmentVersion,
      physicalFingerprint: seatLayoutV3Fingerprint(layout), layout,
      placeStates: buildStates(ids, options?.unavailableElementIds),
      pricing: buildPricing(ids, options?.pricing),
    }, options?.session);
  }

  return { capture };
}

module.exports = { createTripSeatLayoutSnapshotService, reservableIds, buildPricing, buildStates };
