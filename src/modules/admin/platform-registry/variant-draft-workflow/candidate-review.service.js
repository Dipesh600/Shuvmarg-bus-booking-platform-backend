"use strict";

const { getVariantDraft } = require("./context.service.js");
const { normalizeProposedStop, requireReviewCandidate, resolveEligibleStop } = require("./candidate-policy.service.js");
const { routeVariantError } = require("../route-variant-errors.js");

function allowedReviewStatus(value) {
  return ["USE_EXISTING", "CREATE_NEW", "EXCLUDE"].includes(value);
}

async function updateVariantDraftCandidate(variantId, candidateId, data) {
  const { variant, candidate } = await requireReviewCandidate(variantId, candidateId);
  if (!allowedReviewStatus(data.reviewStatus)) {
    throw routeVariantError("INVALID_CANDIDATE_REVIEW", "Choose an allowed candidate review action.");
  }
  if (candidate.isTerminal && data.reviewStatus !== "USE_EXISTING") {
    throw routeVariantError("TERMINAL_CANDIDATE_LOCKED", "A selected physical terminal cannot be excluded or replaced.", 409);
  }
  if (candidate.isTerminal) {
    const terminal = candidate.sequence === 1 ? variant.originTerminalStopId : variant.destinationTerminalStopId;
    candidate.reviewStatus = "USE_EXISTING";
    const terminalId = terminal?._id || terminal || candidate.resolvedStopId || candidate.matchedStopId;
    candidate.matchedStopId = terminalId;
    candidate.resolvedStopId = terminalId;
    candidate.proposedStop = undefined;
  } else if (data.reviewStatus === "USE_EXISTING") {
    const stop = await resolveEligibleStop(data.stopId, candidate.coordinates);
    candidate.reviewStatus = "USE_EXISTING";
    candidate.matchedStopId = stop._id;
    candidate.resolvedStopId = stop._id;
    candidate.proposedStop = undefined;
  } else if (data.reviewStatus === "CREATE_NEW") {
    const proposed = normalizeProposedStop(data.proposedStop, candidate.coordinates);
    candidate.reviewStatus = "CREATE_NEW";
    candidate.resolvedStopId = null;
    candidate.proposedStop = proposed;
    candidate.coordinates = proposed.coordinates;
  } else {
    candidate.reviewStatus = "EXCLUDE";
    candidate.resolvedStopId = null;
    candidate.proposedStop = undefined;
  }
  await candidate.save();
  return getVariantDraft(variant._id, { includeRouteGeometry: true });
}

module.exports = { updateVariantDraftCandidate };
