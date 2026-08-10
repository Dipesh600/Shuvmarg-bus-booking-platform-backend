"use strict";

const mongoose = require("mongoose");

/**
 * Read-only compatibility model for the retired Route Discovery collection.
 * It exists solely for rollout preflight and to protect variants that legacy
 * publication records reference; no runtime route or controller uses it.
 */
const legacyRouteDiscoverySchema = new mongoose.Schema({
  status: { type: String, default: null },
  publishedVariant: {
    variantId: { type: mongoose.Schema.Types.ObjectId, ref: "RouteVariant", default: null },
  },
}, { strict: false, collection: "routediscoveries" });

module.exports = mongoose.models.RouteDiscovery || mongoose.model("RouteDiscovery", legacyRouteDiscoverySchema);
