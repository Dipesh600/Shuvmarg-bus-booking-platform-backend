"use strict";

const mongoose = require("mongoose");

/**
 * Ephemeral Google Routes data used only while an admin reviews a DRAFT
 * RouteVariant. The TTL index guarantees provider content is not retained as
 * permanent platform route data.
 */
const routeVariantMapReviewSchema = new mongoose.Schema({
  variantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "RouteVariant",
    required: true,
    immutable: true,
  },
  provider: {
    type: String,
    enum: ["GOOGLE_ROUTES"],
    required: true,
    default: "GOOGLE_ROUTES",
  },
  reviewStatus: {
    type: String,
    enum: ["OPTIONS_READY", "ROUTE_SELECTED", "STOP_CANDIDATES_READY"],
    default: "OPTIONS_READY",
  },
  routeDataVersion: { type: Number, required: true, default: 1 },
  candidateEngineVersion: { type: Number, default: null },
  // Provider route data lives only on this TTL-protected review document.
  routeOptions: [{
    optionKey: { type: String, required: true },
    providerRouteIndex: { type: Number, required: true, min: 0 },
    encodedPolyline: { type: String, required: true, select: false },
    distanceMeters: { type: Number, required: true, min: 0 },
    durationSeconds: { type: Number, required: true, min: 0 },
    // Ephemeral provider synopsis used only while the TTL review is open.
    description: { type: String, default: null },
    roadLabels: [{ type: String }],
  }],
  selectedRouteOptionKey: { type: String, default: null },
  expiresAt: { type: Date, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
  refreshedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
}, { timestamps: true });

routeVariantMapReviewSchema.index(
  { variantId: 1 },
  { unique: true, name: "route_variant_map_review_variant_unique" }
);
routeVariantMapReviewSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, name: "route_variant_map_review_expiry_ttl" }
);

routeVariantMapReviewSchema.pre("validate", function validateRouteOptions(next) {
  if (!Array.isArray(this.routeOptions) || this.routeOptions.length === 0) {
    this.invalidate("routeOptions", "At least one provider route option is required.");
  }
  const keys = new Set();
  for (const option of this.routeOptions || []) {
    if (keys.has(option.optionKey)) {
      this.invalidate("routeOptions", "Provider route option keys must be unique.");
      break;
    }
    keys.add(option.optionKey);
  }
  if (this.selectedRouteOptionKey && !keys.has(this.selectedRouteOptionKey)) {
    this.invalidate("selectedRouteOptionKey", "Selected route option must belong to this review.");
  }
  next();
});

module.exports = mongoose.model("RouteVariantMapReview", routeVariantMapReviewSchema);
