"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  replaceMapReviewCandidates,
  selectMapReviewRouteOption,
} = require("../../src/modules/admin/platform-registry/variant-map-review/route-variant-map-review.service.js");

function lean(value) {
  return { select() { return this; }, lean: async () => value };
}

function candidateQuery(values) {
  return { select() { return { lean: async () => values.map((value) => ({ ...value })) }; } };
}

test("route selection restores the prior review and candidates when candidate cleanup fails", async () => {
  const originalReview = {
    _id: "review-restore", variantId: "variant-1", expiresAt: new Date(Date.now() + 60000),
    reviewStatus: "STOP_CANDIDATES_READY", selectedRouteOptionKey: "old",
    routeOptions: [
      { optionKey: "old", providerRouteIndex: 0, encodedPolyline: "old-polyline", distanceMeters: 5000, durationSeconds: 600 },
      { optionKey: "new", providerRouteIndex: 1, encodedPolyline: "new-polyline", distanceMeters: 6000, durationSeconds: 700 },
    ],
  };
  let review = { ...originalReview };
  let candidates = [{ _id: "candidate-1", mapReviewId: review._id, candidateKey: "old-candidate" }];
  let deleteAttempts = 0;
  const MapReviewModel = {
    findById: () => lean(review), findOne: () => lean(review),
    findByIdAndUpdate: async (_id, update) => (review = { ...review, ...update }),
  };
  const CandidateModel = {
    find: () => candidateQuery(candidates),
    deleteMany: async () => {
      deleteAttempts += 1;
      if (deleteAttempts === 1) throw new Error("candidate cleanup failed");
      candidates = [];
    },
    insertMany: async (values) => (candidates = values.map((value) => ({ ...value }))),
  };
  await assert.rejects(
    selectMapReviewRouteOption(review._id, "new", { MapReviewModel, CandidateModel }),
    (error) => error.code === "MAP_REVIEW_WRITE_FAILED"
  );
  assert.equal(review.selectedRouteOptionKey, originalReview.selectedRouteOptionKey);
  assert.equal(review.reviewStatus, originalReview.reviewStatus);
  assert.deepEqual(candidates, [{ _id: "candidate-1", mapReviewId: review._id, candidateKey: "old-candidate" }]);
});

test("candidate replacement restores the prior candidate set when insertion fails", async () => {
  const review = {
    _id: "review-candidates", variantId: "variant-1", expiresAt: new Date(Date.now() + 60000),
    reviewStatus: "ROUTE_SELECTED", selectedRouteOptionKey: "selected",
  };
  let candidates = [{ _id: "candidate-1", mapReviewId: review._id, candidateKey: "old-candidate" }];
  let insertAttempts = 0;
  const MapReviewModel = {
    findById: () => lean(review), findOne: () => lean(review),
    findByIdAndUpdate: async () => review,
  };
  const CandidateModel = {
    find: () => candidateQuery(candidates),
    deleteMany: async () => { candidates = []; },
    insertMany: async (values) => {
      insertAttempts += 1;
      if (insertAttempts === 1) throw new Error("candidate insert failed");
      candidates = values.map((value) => ({ ...value }));
      return candidates;
    },
  };
  await assert.rejects(
    replaceMapReviewCandidates(review._id, [{
      providerSnapshot: { provider: "GOOGLE_PLACES", displayName: "Mugling" },
      coordinates: { lat: 27.7, lng: 84.4 },
    }], { MapReviewModel, CandidateModel }),
    (error) => error.code === "MAP_REVIEW_WRITE_FAILED"
  );
  assert.deepEqual(candidates, [{ _id: "candidate-1", mapReviewId: review._id, candidateKey: "old-candidate" }]);
  assert.equal(review.reviewStatus, "ROUTE_SELECTED");
});
