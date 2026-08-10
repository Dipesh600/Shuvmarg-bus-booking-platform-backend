"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const RouteVariant = require("../../models/routeVariantModel.js");
const RouteVariantMapReview = require("../../models/routeVariantMapReviewModel.js");
const RouteVariantStopCandidate = require("../../models/routeVariantStopCandidateModel.js");
const {
  MAX_REVIEW_TTL_MS,
  buildReviewExpiry,
  createOrReplaceMapReview,
  getSelectedProviderRouteOption,
  replaceMapReviewCandidates,
  selectMapReviewRouteOption,
} = require("../../src/modules/admin/platform-registry/variant-map-review/route-variant-map-review.service.js");
function lean(value) {
  return { select() { return this; }, lean: async () => value };
}
function stopModel(stops) {
  return { findById: (id) => lean(stops[String(id)] || null) };
}
const activeRouteStop = (id, parentStopId = null) => ({
  _id: id, parentStopId, status: "ACTIVE", verificationStatus: "VERIFIED", isRouteStop: true,
});
test("draft variants can be unnamed, while active variants require a name", async () => {
  const corridorId = new mongoose.Types.ObjectId();
  const draft = new RouteVariant({ code: "KTM-MLW-V01", corridorId, status: "DRAFT" });
  await draft.validate();
  const active = new RouteVariant({ code: "KTM-MLW-V02", corridorId, status: "ACTIVE" });
  await assert.rejects(active.validate(), /name/);
});
test("map review and candidates have TTL indexes while RouteVariant has no provider route data", () => {
  const mapIndexes = RouteVariantMapReview.schema.indexes();
  const candidateIndexes = RouteVariantStopCandidate.schema.indexes();
  assert.ok(mapIndexes.some(([, options]) => options.name === "route_variant_map_review_expiry_ttl"));
  assert.ok(candidateIndexes.some(([, options]) => options.name === "route_variant_stop_candidate_expiry_ttl"));
  assert.equal(RouteVariant.schema.path("routeOptions"), undefined);
  assert.ok(RouteVariant.schema.path("originTerminalStopId"));
  assert.ok(RouteVariant.schema.path("destinationTerminalStopId"));
});
test("map review keeps server route options, lets a client select by key, then accepts candidates", async () => {
  const stops = { ktm: activeRouteStop("ktm"), mlw: activeRouteStop("mlw") };
  const variant = {
    _id: "variant-1", corridorId: "corridor-1", status: "DRAFT", direction: "FORWARD",
    originTerminalStopId: "ktm", destinationTerminalStopId: "mlw",
  };
  const corridor = { _id: "corridor-1", originId: "ktm", destinationId: "mlw" };
  let storedReview;
  const updates = [];
  const candidateWrites = [];
  const dependencies = {
    now: new Date("2026-08-09T00:00:00.000Z"),
    RouteVariantModel: { findById: () => lean(variant) },
    RouteCorridorModel: { findById: () => lean(corridor) },
    StopModel: stopModel(stops),
    MapReviewModel: {
      findOne: () => lean(storedReview || null),
      create: async (value) => { storedReview = { _id: "review-1", ...value }; return storedReview; },
      findById: () => lean(storedReview),
      findByIdAndUpdate: async (_id, value) => { updates.push(value); return { ...storedReview, ...value }; },
    },
    CandidateModel: {
      find: () => ({ select() { return { lean: async () => [] }; } }),
      deleteMany: async () => {},
      insertMany: async (values) => { candidateWrites.push(...values); return values; },
    },
  };
  const review = await createOrReplaceMapReview({
    variantId: variant._id,
    providerRouteOptions: [
      { providerRouteIndex: 0, encodedPolyline: "first", distanceMeters: 5000, durationSeconds: 600 },
      { providerRouteIndex: 1, encodedPolyline: "second", distanceMeters: 6500, durationSeconds: 720 },
    ],
  }, "admin-1", dependencies);
  assert.equal(review.reviewStatus, "OPTIONS_READY");
  assert.equal(review.routeOptions.length, 2);
  const selection = await selectMapReviewRouteOption(
    review._id, review.routeOptions[1].optionKey, dependencies
  );
  assert.deepEqual(selection, {
    optionKey: review.routeOptions[1].optionKey, providerRouteIndex: 1,
    distanceMeters: 6500, durationSeconds: 720,
  });
  storedReview = { ...storedReview, ...updates.at(-1) };
  const rawSelection = await getSelectedProviderRouteOption(review._id, dependencies);
  assert.equal(rawSelection.encodedPolyline, "second");
  await replaceMapReviewCandidates(review._id, [{
    providerSnapshot: { provider: "GOOGLE_PLACES", displayName: "Mugling" },
    coordinates: { lat: 27.7, lng: 84.4 },
  }], dependencies);
  assert.equal(candidateWrites.length, 1);
  assert.equal(candidateWrites[0].expiresAt.getTime(), review.expiresAt.getTime());
});

test("map review accepts a direction-only draft before physical terminals are resolved", async () => {
  const variant = {
    _id: "variant-1", corridorId: "corridor-1", status: "DRAFT",
    direction: "FORWARD", originTerminalStopId: null, destinationTerminalStopId: null,
  };
  const corridor = { _id: "corridor-1", originId: "ktm", destinationId: "mlw" };
  let storedReview;
  const review = await createOrReplaceMapReview({
    variantId: variant._id,
    providerRouteOptions: [
      { providerRouteIndex: 0, encodedPolyline: "first", distanceMeters: 5000, durationSeconds: 600 },
    ],
  }, "admin-1", {
    now: new Date("2026-08-09T00:00:00.000Z"),
    RouteVariantModel: { findById: () => lean(variant) },
    RouteCorridorModel: { findById: () => lean(corridor) },
    MapReviewModel: {
      findOne: () => lean(storedReview || null),
      create: async (value) => { storedReview = { _id: "review-1", ...value }; return storedReview; },
    },
    CandidateModel: { find: () => ({ select() { return { lean: async () => [] }; } }), deleteMany: async () => {} },
  });
  assert.equal(review.reviewStatus, "OPTIONS_READY");
  assert.equal(review.routeOptions.length, 1);
});

test("map-review expiry is bounded and candidates require a selected route", async () => {
  assert.throws(
    () => buildReviewExpiry({ ttlMs: MAX_REVIEW_TTL_MS + 1 }),
    (error) => error.code === "INVALID_MAP_ROUTE_REVIEW"
  );
  const review = { _id: "review-1", variantId: "variant-1", expiresAt: new Date(Date.now() + 60000) };
  await assert.rejects(
    replaceMapReviewCandidates("review-1", [], {
      MapReviewModel: { findById: () => lean(review) },
      CandidateModel: {},
    }),
    (error) => error.code === "MAP_REVIEW_ROUTE_NOT_SELECTED"
  );
});
