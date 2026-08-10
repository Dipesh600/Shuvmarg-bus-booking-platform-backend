"use strict";

const { randomUUID } = require("node:crypto");
const mongoose = require("mongoose");

/**
 * Temporary stop suggestions for one RouteVariantMapReview. Provider labels,
 * addresses and place IDs expire with the review; only a later approved
 * RouteStop becomes canonical platform data.
 */
const routeVariantStopCandidateSchema = new mongoose.Schema({
  mapReviewId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "RouteVariantMapReview",
    required: true,
    immutable: true,
  },
  variantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "RouteVariant",
    required: true,
    immutable: true,
  },
  candidateKey: {
    type: String,
    required: true,
    immutable: true,
    default: () => randomUUID(),
  },
  sequence: { type: Number, required: true, min: 1 },
  // The selected physical terminals are platform records, not suggestions.
  // They must stay at the ends of the reviewed sequence.
  isTerminal: { type: Boolean, required: true, default: false },
  providerSnapshot: {
    provider: {
      type: String,
      enum: ["GOOGLE_PLACES", "GOOGLE_ROUTES", "PLATFORM_STOP"],
      required: true,
    },
    placeId: { type: String, trim: true, default: null, select: false },
    displayName: { type: String, trim: true, required: true, select: false },
    formattedAddress: { type: String, trim: true, default: null, select: false },
    discoveryMethod: {
      type: String,
      enum: ["CANONICAL_REGISTRY", "SEARCH_ALONG_ROUTE", "REVERSE_GEOCODE"],
      default: null,
    },
    types: [{ type: String }],
    administrativeContext: {
      province: { type: String, trim: true, default: null },
      district: { type: String, trim: true, default: null },
      municipality: { type: String, trim: true, default: null },
    },
  },
  classification: {
    entityType: {
      type: String,
      enum: ["ROUTE_STOP", "SERVICE_AREA", "BOARDING_LOCATION"],
      required: true,
    },
    confidence: {
      type: String,
      enum: ["HIGH", "MEDIUM", "LOW"],
      required: true,
    },
    reasonCodes: [{
      type: String,
      enum: [
        "CANONICAL_VERIFIED_ROUTE_STOP",
        "GOOGLE_TRANSIT_PLACE",
        "NEAR_CANONICAL_ROUTE_STOP",
        "NO_CANONICAL_ROUTE_STOP_NEARBY",
        "TRANSIT_PLACE_SERVICE_AREA_INFERENCE",
      ],
    }],
    suggestedParentStopId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Stop",
      default: null,
    },
    coverageZone: {
      type: String,
      enum: ["ORIGIN_40KM", "MIDDLE", "DESTINATION_40KM"],
      default: "MIDDLE",
    },
    distanceToRouteMeters: { type: Number, min: 0, default: null },
  },
  coordinates: {
    lat: { type: Number, required: true, min: -90, max: 90 },
    lng: { type: Number, required: true, min: -180, max: 180 },
  },
  distanceFromOriginMeters: { type: Number, min: 0, default: null },
  durationFromOriginSeconds: { type: Number, min: 0, default: null },
  reviewStatus: {
    type: String,
    enum: ["UNREVIEWED", "USE_EXISTING", "CREATE_NEW", "EXCLUDE"],
    default: "UNREVIEWED",
  },
  matchedStopId: { type: mongoose.Schema.Types.ObjectId, ref: "Stop", default: null },
  resolvedStopId: { type: mongoose.Schema.Types.ObjectId, ref: "Stop", default: null },
  // This is admin-authored input only. Provider content remains inside the
  // TTL-protected providerSnapshot and is never promoted automatically.
  proposedStop: {
    name: { type: String, trim: true, default: null },
    code: { type: String, trim: true, uppercase: true, default: null },
    type: { type: String, enum: ["CITY", "JUNCTION", "TOWN", "HIGHWAY_STOP", "BORDER"], default: null },
    province: { type: String, trim: true, default: null },
    district: { type: String, trim: true, default: null },
    municipality: { type: String, trim: true, default: null },
    parentStopId: { type: mongoose.Schema.Types.ObjectId, ref: "Stop", default: null },
    isSearchable: { type: Boolean, default: true },
    coordinateSource: { type: String, default: null },
    coordinateProvider: { type: String, default: null },
    coordinatePlaceId: { type: String, default: null },
    coordinateSuggestedAddress: { type: String, default: null },
    coordinates: {
      lat: { type: Number, min: -90, max: 90, default: null },
      lng: { type: Number, min: -180, max: 180, default: null },
    },
  },
  reviewNotes: { type: String, trim: true, default: null, maxlength: 1000 },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

routeVariantStopCandidateSchema.index(
  { mapReviewId: 1, sequence: 1 },
  { unique: true, name: "route_variant_stop_candidate_sequence_unique" }
);
routeVariantStopCandidateSchema.index(
  { candidateKey: 1 },
  { unique: true, name: "route_variant_stop_candidate_key_unique" }
);
routeVariantStopCandidateSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, name: "route_variant_stop_candidate_expiry_ttl" }
);

module.exports = mongoose.model("RouteVariantStopCandidate", routeVariantStopCandidateSchema);
