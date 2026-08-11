"use strict";

const { randomUUID } = require("node:crypto");
const { corridorError } = require("../../../../domain/corridor/corridor-errors.js");

function positiveNumber(value, field) {
  if (!Number.isFinite(value) || value < 0) {
    throw corridorError("INVALID_MAP_ROUTE_REVIEW", `${field} must be a non-negative number.`);
  }
  return value;
}

function requiredText(value, field) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw corridorError("INVALID_MAP_ROUTE_REVIEW", `${field} is required.`);
  return text;
}

function buildProviderRouteOptions(options) {
  if (!Array.isArray(options) || !options.length) {
    throw corridorError("INVALID_MAP_ROUTE_REVIEW", "At least one provider route option is required.");
  }
  const indexes = new Set();
  return options.map((option, index) => {
    const providerRouteIndex = option.providerRouteIndex ?? index;
    if (!Number.isInteger(providerRouteIndex) || providerRouteIndex < 0 || indexes.has(providerRouteIndex)) {
      throw corridorError("INVALID_MAP_ROUTE_REVIEW", "Provider route indexes must be unique non-negative integers.");
    }
    indexes.add(providerRouteIndex);
    return {
      optionKey: randomUUID(),
      providerRouteIndex,
      encodedPolyline: requiredText(option.encodedPolyline, "Route polyline"),
      distanceMeters: positiveNumber(option.distanceMeters, "Route distance"),
      durationSeconds: positiveNumber(option.durationSeconds, "Route duration"),
      description: typeof option.description === "string" ? option.description.trim() || null : null,
      roadLabels: [...new Set((option.roadLabels || [])
        .filter((label) => typeof label === "string")
        .map((label) => label.trim()).filter(Boolean))].slice(0, 6),
    };
  });
}

function buildCandidateWrites(candidates, { mapReviewId, variantId, expiresAt }) {
  if (!Array.isArray(candidates) || !candidates.length) {
    throw corridorError("INVALID_MAP_ROUTE_REVIEW", "At least one stop candidate is required.");
  }
  const sequences = new Set();
  return candidates.map((candidate, index) => {
    const sequence = candidate.sequence ?? index + 1;
    if (!Number.isInteger(sequence) || sequence < 1 || sequences.has(sequence)) {
      throw corridorError("INVALID_MAP_ROUTE_REVIEW", "Candidate sequences must be unique positive integers.");
    }
    sequences.add(sequence);
    const coordinates = candidate.coordinates || {};
    if (!Number.isFinite(coordinates.lat) || coordinates.lat < -90 || coordinates.lat > 90 ||
        !Number.isFinite(coordinates.lng) || coordinates.lng < -180 || coordinates.lng > 180) {
      throw corridorError("INVALID_MAP_ROUTE_REVIEW", "Every candidate requires valid coordinates.");
    }
    const isTerminal = candidate.isTerminal === true;
    const reviewStatus = candidate.reviewStatus || (isTerminal ? "USE_EXISTING" : "UNREVIEWED");
    if (![
      "UNREVIEWED", "USE_EXISTING", "CREATE_NEW", "EXCLUDE",
    ].includes(reviewStatus)) {
      throw corridorError("INVALID_MAP_ROUTE_REVIEW", "Candidate review status is invalid.");
    }
    if (isTerminal && (reviewStatus !== "USE_EXISTING" || !candidate.resolvedStopId)) {
      throw corridorError(
        "INVALID_MAP_ROUTE_REVIEW", "Every terminal candidate must resolve to its selected platform stop."
      );
    }
    return {
      mapReviewId,
      variantId,
      sequence,
      isTerminal,
      providerSnapshot: {
        provider: candidate.providerSnapshot?.provider || "GOOGLE_PLACES",
        placeId: candidate.providerSnapshot?.placeId || null,
        displayName: requiredText(candidate.providerSnapshot?.displayName, "Candidate display name"),
        formattedAddress: candidate.providerSnapshot?.formattedAddress || null,
        discoveryMethod: candidate.providerSnapshot?.discoveryMethod ||
          (candidate.providerSnapshot?.provider === "PLATFORM_STOP" ? "CANONICAL_REGISTRY" : "REVERSE_GEOCODE"),
        types: (candidate.providerSnapshot?.types || [])
          .filter((type) => typeof type === "string").slice(0, 12),
        administrativeContext: candidate.providerSnapshot?.administrativeContext || null,
      },
      classification: {
        entityType: candidate.classification?.entityType ||
          (candidate.providerSnapshot?.provider === "PLATFORM_STOP" ? "ROUTE_STOP" : "BOARDING_LOCATION"),
        confidence: candidate.classification?.confidence ||
          (candidate.providerSnapshot?.provider === "PLATFORM_STOP" ? "HIGH" : "LOW"),
        reasonCodes: (candidate.classification?.reasonCodes || []).slice(0, 4),
        suggestedParentStopId: candidate.classification?.suggestedParentStopId?._id || candidate.classification?.suggestedParentStopId || null,
        coverageZone: candidate.classification?.coverageZone || "MIDDLE",
        distanceToRouteMeters: candidate.classification?.distanceToRouteMeters ?? null,
      },
      coordinates: { lat: coordinates.lat, lng: coordinates.lng },
      distanceFromOriginMeters: candidate.distanceFromOriginMeters ?? null,
      durationFromOriginSeconds: candidate.durationFromOriginSeconds ?? null,
      reviewStatus,
      matchedStopId: candidate.matchedStopId || null,
      resolvedStopId: candidate.resolvedStopId || null,
      ...(candidate.proposedStop && { proposedStop: candidate.proposedStop }),
      ...(candidate.reviewNotes && { reviewNotes: candidate.reviewNotes }),
      expiresAt,
    };
  });
}

module.exports = { buildCandidateWrites, buildProviderRouteOptions };
