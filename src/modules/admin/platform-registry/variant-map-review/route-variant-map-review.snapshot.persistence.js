"use strict";

const { corridorError } = require("../../../../domain/corridor/corridor-errors.js");

function withSession(query, session) {
  return session && typeof query?.session === "function" ? query.session(session) : query;
}

async function asLean(query) {
  return typeof query?.lean === "function" ? query.lean() : query;
}

function writeOptions(session, options = {}) {
  return session ? { ...options, session } : options;
}

async function loadReview(Model, filter, session = null) {
  let query = Model.findOne(filter);
  if (typeof query?.select === "function") query = query.select("+routeOptions.encodedPolyline");
  return asLean(withSession(query, session));
}

async function loadCandidates(Model, mapReviewId, session = null) {
  let query = Model.find({ mapReviewId });
  if (typeof query?.select === "function") {
    query = query.select("+providerSnapshot.placeId +providerSnapshot.displayName +providerSnapshot.formattedAddress");
  }
  return asLean(withSession(query, session));
}

async function createReview(Model, payload, session = null) {
  if (!session) return Model.create(payload);
  const created = await Model.create([payload], writeOptions(session));
  return Array.isArray(created) ? created[0] : created;
}

async function updateReview(Model, reviewId, payload, session = null) {
  const updated = await Model.findByIdAndUpdate(
    reviewId, payload, writeOptions(session, { new: true, runValidators: true })
  );
  if (!updated) throw corridorError("MAP_REVIEW_NOT_FOUND", "The route-map review no longer exists.", 404);
  return updated;
}

async function replaceCandidates(Model, mapReviewId, writes, session = null) {
  await Model.deleteMany({ mapReviewId }, writeOptions(session));
  if (writes.length === 0) return [];
  return Model.insertMany(writes, writeOptions(session, { ordered: true }));
}

function reviewRestorePayload(review) {
  return {
    provider: review.provider,
    routeOptions: review.routeOptions,
    selectedRouteOptionKey: review.selectedRouteOptionKey,
    reviewStatus: review.reviewStatus,
    expiresAt: review.expiresAt,
    createdBy: review.createdBy || null,
    refreshedBy: review.refreshedBy || null,
  };
}

async function restoreSnapshots({ MapReviewModel, CandidateModel, review, candidates, restoreReview, restoreCandidates }) {
  try {
    if (restoreReview) await updateReview(MapReviewModel, review._id, reviewRestorePayload(review));
    if (restoreCandidates) await replaceCandidates(CandidateModel, review._id, candidates);
  } catch (restoreError) {
    throw corridorError(
      "MAP_REVIEW_RESTORE_FAILED",
      "The route-map review could not be saved and its previous review state could not be restored.",
      500,
      { restoreCause: restoreError.message }
    );
  }
}

function mapWriteFailure(error) {
  if (error?.code && error?.statusCode) return error;
  return corridorError(
    "MAP_REVIEW_WRITE_FAILED",
    "The route-map review could not be saved. Your previous review remains available.",
    500
  );
}

module.exports = {
  createReview, loadCandidates, loadReview, mapWriteFailure,
  replaceCandidates, restoreSnapshots, updateReview,
};
