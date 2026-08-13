"use strict";

function resolveSeatLayoutRead({ snapshot, trip }) {
  if (snapshot) {
    return {
      source: "TRIP_V3_SNAPSHOT",
      schemaVersion: 3,
      layout: snapshot.layout,
      placeStates: snapshot.placeStates,
      pricing: snapshot.pricing,
    };
  }
  const legacy = trip?.seatTemplateId?.seatConfig || trip?.busId?.seatConfig || null;
  return {
    source: legacy ? "LEGACY_V2" : "NONE",
    schemaVersion: legacy ? 2 : null,
    layout: legacy,
    placeStates: null,
    pricing: null,
  };
}

module.exports = { resolveSeatLayoutRead };
