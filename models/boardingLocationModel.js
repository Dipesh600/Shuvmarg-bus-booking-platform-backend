"use strict";

const mongoose = require("mongoose");
const {
  buildBoardingLocationIdentity,
} = require("../src/domain/boarding-location/boarding-location-identity.js");
const {
  normalizeBoardingCoordinates,
  toGeoPoint,
} = require("../src/domain/boarding-location/boarding-location-coordinates.js");
const {
  normalizeBoardingLocationAliases,
} = require("../src/domain/boarding-location/boarding-location-aliases.js");

const boardingLocationSchema = new mongoose.Schema({
  stopId: {
    type: mongoose.Schema.Types.ObjectId, ref: "Stop", required: true,
  },
  name: { type: String, required: true, trim: true },
  _normalizedIdentity: { type: String, required: true },
  aliases: [{ type: String, trim: true }],
  landmark: { type: String, trim: true, default: null },
  address: { type: String, trim: true, default: null },
  locationType: {
    type: String,
    enum: ["BUS_PARK", "TERMINAL_GATE", "BUS_BAY", "ROADSIDE", "COUNTER", "LANDMARK"],
    default: "ROADSIDE",
  },
  gateOrBay: { type: String, trim: true, default: null },
  directionHint: { type: String, trim: true, default: null },
  coordinates: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
  },
  geo: {
    type: { type: String, enum: ["Point"], default: "Point" },
    coordinates: { type: [Number], required: true },
  },
  coordinateSource: {
    type: String,
    enum: ["MAP_PIN", "GOOGLE_PLACE", "ADMIN_GPS", "OPERATOR_GPS", "FIELD_GPS", "DISCOVERY"],
    default: "MAP_PIN",
  },
  coordinateAccuracyMeters: { type: Number, min: 0, default: null },
  capturedAt: { type: Date, default: null },
  providerMetadata: {
    provider: { type: String, enum: ["GOOGLE", "MAPBOX"], default: null },
    placeId: { type: String, trim: true, default: null },
    suggestedAddress: { type: String, trim: true, default: null },
  },
  verificationStatus: {
    type: String, enum: ["PENDING", "VERIFIED", "REJECTED"],
    default: "PENDING",
  },
  verificationMethod: {
    type: String,
    enum: ["DESK_MAP", "OPERATOR_EVIDENCE", "FIELD_GPS"],
    default: null,
  },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  verifiedAt: { type: Date, default: null },
  verificationNotes: { type: String, trim: true, default: null },
  nearbyReview: {
    reason: { type: String, trim: true, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    reviewedAt: { type: Date, default: null },
  },
  source: {
    type: String,
    enum: [
      "ADMIN", "OPERATOR_REQUEST", "FIELD_COLLECTION",
      "DISCOVERY", "LEGACY_MIGRATION",
    ],
    default: "ADMIN",
  },
  status: {
    type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE",
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  createdByType: {
    type: String, enum: ["ADMIN", "BUS_OWNER", "SYSTEM"], default: "ADMIN",
  },
  legacySource: {
    model: {
      type: String, enum: ["BoardingPoints", "StopPoint"], default: null,
    },
    id: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
}, { timestamps: true });

boardingLocationSchema.index(
  { _normalizedIdentity: 1 },
  { unique: true, name: "boarding_location_identity_unique" }
);
boardingLocationSchema.index({ stopId: 1, status: 1 });
boardingLocationSchema.index({ verificationStatus: 1, status: 1 });
boardingLocationSchema.index({ name: "text", aliases: "text" });
boardingLocationSchema.index({ geo: "2dsphere" });
boardingLocationSchema.index(
  { "legacySource.model": 1, "legacySource.id": 1 },
  {
    unique: true,
    name: "boarding_location_legacy_unique",
    partialFilterExpression: { "legacySource.id": { $type: "objectId" } },
  }
);

boardingLocationSchema.pre("validate", function prepareLocation(next) {
  try {
    this.coordinates = normalizeBoardingCoordinates(this.coordinates);
    this.geo = toGeoPoint(this.coordinates);
    this._normalizedIdentity = buildBoardingLocationIdentity(this);
    this.aliases = normalizeBoardingLocationAliases(this.aliases, this.name);
    next();
  } catch (error) {
    next(error);
  }
});

module.exports = mongoose.model("BoardingLocation", boardingLocationSchema);
