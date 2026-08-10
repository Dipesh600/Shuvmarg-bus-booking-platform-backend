"use strict";

const { runVariantWrite } = require("../variant-write-transaction.service.js");
const CANDIDATE_ENGINE_VERSION = 8;
const {
  createReview, loadCandidates, loadReview, mapWriteFailure,
  replaceCandidates, restoreSnapshots, updateReview,
} = require("./route-variant-map-review.snapshot.persistence.js");

async function replaceReview({ MapReviewModel, CandidateModel, variantId, payload, createdBy, mongooseImpl }) {
  const write = async (session) => {
    const existing = await loadReview(MapReviewModel, { variantId }, session);
    if (!existing) return createReview(MapReviewModel, { variantId, createdBy, ...payload }, session);
    await replaceCandidates(CandidateModel, existing._id, [], session);
    return updateReview(MapReviewModel, existing._id, payload, session);
  };
  const fallback = async () => {
    const existing = await loadReview(MapReviewModel, { variantId });
    if (!existing) return createReview(MapReviewModel, { variantId, createdBy, ...payload });
    const candidates = await loadCandidates(CandidateModel, existing._id);
    let reviewChanged = false;
    let candidateWriteStarted = false;
    try {
      reviewChanged = true;
      const updated = await updateReview(MapReviewModel, existing._id, payload);
      candidateWriteStarted = true;
      await replaceCandidates(CandidateModel, existing._id, []);
      return updated;
    } catch (error) {
      await restoreSnapshots({
        MapReviewModel, CandidateModel, review: existing, candidates,
        restoreReview: reviewChanged, restoreCandidates: candidateWriteStarted,
      });
      throw mapWriteFailure(error);
    }
  };
  return runVariantWrite({ mongooseImpl, transactionWork: write, fallbackWork: fallback });
}

async function selectReviewRoute({ MapReviewModel, CandidateModel, review, selectedRouteOption, mongooseImpl }) {
  const update = {
    selectedRouteOptionKey: selectedRouteOption.optionKey,
    reviewStatus: "ROUTE_SELECTED",
  };
  const write = async (session) => {
    await updateReview(MapReviewModel, review._id, update, session);
    await replaceCandidates(CandidateModel, review._id, [], session);
  };
  const fallback = async () => {
    const previousReview = await loadReview(MapReviewModel, { _id: review._id });
    if (!previousReview) throw mapWriteFailure({});
    const candidates = await loadCandidates(CandidateModel, previousReview._id);
    let reviewChanged = false;
    let candidateWriteStarted = false;
    try {
      reviewChanged = true;
      await updateReview(MapReviewModel, previousReview._id, update);
      candidateWriteStarted = true;
      await replaceCandidates(CandidateModel, previousReview._id, []);
    } catch (error) {
      await restoreSnapshots({
        MapReviewModel, CandidateModel, review: previousReview, candidates,
        restoreReview: reviewChanged, restoreCandidates: candidateWriteStarted,
      });
      throw mapWriteFailure(error);
    }
  };
  await runVariantWrite({ mongooseImpl, transactionWork: write, fallbackWork: fallback });
}

async function replaceReviewCandidates({ MapReviewModel, CandidateModel, review, writes, mongooseImpl }) {
  const write = async (session) => {
    await replaceCandidates(CandidateModel, review._id, writes, session);
    await updateReview(MapReviewModel, review._id, {
      reviewStatus: "STOP_CANDIDATES_READY", candidateEngineVersion: CANDIDATE_ENGINE_VERSION,
    }, session);
  };
  const fallback = async () => {
    const previousReview = await loadReview(MapReviewModel, { _id: review._id });
    if (!previousReview) throw mapWriteFailure({});
    const candidates = await loadCandidates(CandidateModel, previousReview._id);
    let candidateWriteStarted = false;
    let reviewChanged = false;
    try {
      candidateWriteStarted = true;
      await replaceCandidates(CandidateModel, previousReview._id, writes);
      reviewChanged = true;
      await updateReview(MapReviewModel, previousReview._id, {
        reviewStatus: "STOP_CANDIDATES_READY", candidateEngineVersion: CANDIDATE_ENGINE_VERSION,
      });
    } catch (error) {
      await restoreSnapshots({
        MapReviewModel, CandidateModel, review: previousReview, candidates,
        restoreReview: reviewChanged, restoreCandidates: candidateWriteStarted,
      });
      throw mapWriteFailure(error);
    }
  };
  return runVariantWrite({ mongooseImpl, transactionWork: write, fallbackWork: fallback });
}

module.exports = { replaceReview, replaceReviewCandidates, selectReviewRoute };
