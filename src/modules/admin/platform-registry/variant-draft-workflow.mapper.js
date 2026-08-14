"use strict";

const { CANDIDATE_ENGINE_VERSION, ROUTE_DATA_VERSION } = require("./variant-map-review/route-variant-map-review.versions.js");
function idOf(value) {
  return value ? String(value._id || value) : null;
}

function mapStopReference(stop) {
  if (!stop) return null;
  const id = idOf(stop);
  return {
    id,
    _id: id,
    stopId: id,
    code: stop.code || null,
    name: stop.name || null,
    type: stop.type || null,
    province: stop.province || null,
    district: stop.district || null,
    municipality: stop.municipality || null,
    coordinates: stop.coordinates || null,
  };
}

function round(value, decimalPlaces = 1) {
  if (!Number.isFinite(value)) return null;
  const scale = 10 ** decimalPlaces;
  return Math.round(value * scale) / scale;
}

function mapRouteOption(option, index) {
  const providerLabel = option.description || option.roadLabels?.[0] || null;
  return {
    id: option.optionKey,
    label: providerLabel || (index === 0 ? "Primary Google road path" :
      `Google road path ${index + 1}`),
    description: option.description || null,
    roadLabels: option.roadLabels || [],
    distanceKm: round(option.distanceMeters / 1000),
    durationMinutes: Math.round(option.durationSeconds / 60),
    encodedPolyline: option.encodedPolyline,
    isRecommended: option.providerRouteIndex === 0,
  };
}

function nextActionFor({ variant, review, candidates }) {
  if (!review?.selectedRouteOptionKey) return "SELECT_PATH";
  if (review.reviewStatus !== "STOP_CANDIDATES_READY" || candidates.length === 0) {
    return "REVIEW_STOPS";
  }
  const unresolved = candidates.some((candidate) =>
    !candidate.isTerminal && candidate.classification?.entityType !== "BOARDING_LOCATION" &&
    candidate.reviewStatus === "UNREVIEWED"
  );
  if (unresolved) return "REVIEW_STOPS";
  if (!variant.name) return "NAME_PATH";
  return "READY_TO_SAVE";
}

function suggestedStop(candidate, provider) {
  const context = provider.administrativeContext || {};
  return {
    name: provider.displayName || "",
    type: "TOWN",
    province: context.province || null,
    district: context.district || null,
    municipality: context.municipality || null,
    coordinates: candidate.coordinates || null,
    isSearchable: true,
    isRouteStop: true,
    coordinateSource: provider.placeId ? "GOOGLE_PLACE" : "DISCOVERY",
    coordinateProvider: "GOOGLE",
    coordinatePlaceId: provider.placeId || null,
    coordinateSuggestedAddress: provider.formattedAddress || null,
  };
}

function mapCandidate(candidate) {
  const provider = candidate.providerSnapshot || {};
  return {
    id: idOf(candidate),
    candidateKey: candidate.candidateKey,
    sequence: candidate.sequence,
    isTerminal: candidate.isTerminal === true,
    source: provider.provider,
    discoveryMethod: provider.discoveryMethod || null,
    providerTypes: provider.types || [],
    classification: {
      entityType: candidate.classification?.entityType ||
        (provider.provider === "PLATFORM_STOP" ? "ROUTE_STOP" : "BOARDING_LOCATION"),
      confidence: candidate.classification?.confidence || "LOW",
      reasonCodes: candidate.classification?.reasonCodes || [],
      suggestedParentStop: mapStopReference(candidate.classification?.suggestedParentStopId),
      coverageZone: candidate.classification?.coverageZone || "MIDDLE",
      distanceToRouteMeters: candidate.classification?.distanceToRouteMeters ?? null,
      evidenceScore: candidate.classification?.evidenceScore ?? null,
    },
    displayName: provider.displayName,
    formattedAddress: provider.formattedAddress || null,
    suggestedStop: suggestedStop(candidate, provider),
    coordinates: candidate.coordinates,
    distanceKm: round((candidate.distanceFromOriginMeters || 0) / 1000),
    durationMinutes: Math.round((candidate.durationFromOriginSeconds || 0) / 60),
    reviewStatus: candidate.reviewStatus,
    matchedStop: mapStopReference(candidate.matchedStopId),
    resolvedStop: mapStopReference(candidate.resolvedStopId),
    proposedStop: candidate.proposedStop || null,
  };
}

function mapVariantDraft({ variant, review, candidates = [], warnings = [] }) {
  const routeDataCurrent = review?.routeDataVersion === ROUTE_DATA_VERSION;
  const candidateEngineCurrent = review?.candidateEngineVersion === CANDIDATE_ENGINE_VERSION;
  const routeOptions = routeDataCurrent ? (review?.routeOptions || []).map(mapRouteOption) : [];
  const mappedCandidates = candidateEngineCurrent ? candidates.map(mapCandidate) : [];
  const effectiveReview = routeDataCurrent ? review : null;
  return {
    id: idOf(variant),
    _id: idOf(variant),
    corridorId: idOf(variant.corridorId),
    code: variant.code,
    direction: variant.direction,
    routeFamilyId: idOf(variant.routeFamilyId),
    companionVariantId: idOf(variant.returnVariantId),
    revisionOfVariantId: idOf(variant.revisionOfVariantId),
    revisionNumber: variant.revisionNumber || 1,
    status: variant.status,
    workflowStatus: effectiveReview?.reviewStatus === "STOP_CANDIDATES_READY" && !candidateEngineCurrent
      ? "ROUTE_SELECTED" : effectiveReview?.reviewStatus || "DRAFT_CREATED",
    name: variant.name || null,
    type: variant.type,
    originTerminal: mapStopReference(variant.originTerminalStopId),
    destinationTerminal: mapStopReference(variant.destinationTerminalStopId),
    routeOptions,
    selectedRouteOptionId: effectiveReview?.selectedRouteOptionKey || null,
    candidates: mappedCandidates,
    nextAction: nextActionFor({ variant, review: effectiveReview, candidates: mappedCandidates }),
    routeDataVersion: review?.routeDataVersion || 1,
    candidateEngineVersion: review?.candidateEngineVersion || null,
    expiresAt: review?.expiresAt || null,
    warnings: [
      ...warnings,
      ...(!routeDataCurrent && review ? ["Road-route suggestions were created by an older engine. Refresh them before continuing."] : []),
      ...(routeDataCurrent && review?.reviewStatus === "STOP_CANDIDATES_READY" && !candidateEngineCurrent
        ? ["Stop suggestions were created by an older engine. Run stop review again."] : []),
    ],
  };
}

module.exports = { idOf, mapCandidate, mapStopReference, mapVariantDraft, nextActionFor };
