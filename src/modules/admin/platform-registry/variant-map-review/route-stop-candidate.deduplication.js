"use strict";

const { metersBetween } = require("./route-stop-candidate.geometry.js");

function normalizePlaceName(value) {
  return String(value || "").normalize("NFKC").toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}

function candidateIdentity(candidate) {
  const context = candidate.providerSnapshot?.administrativeContext || {};
  return [candidate.providerSnapshot?.displayName, context.district, context.municipality]
    .map(normalizePlaceName).join(":");
}

function hasCompleteAdministrativeIdentity(candidate) {
  const context = candidate.providerSnapshot?.administrativeContext || {};
  return Boolean(normalizePlaceName(context.district) && normalizePlaceName(context.municipality));
}

function nearestRegistryMatch(candidate, registry, radiusMeters, requireName = true) {
  const candidateName = normalizePlaceName(candidate.providerSnapshot?.displayName);
  return registry.reduce((closest, entry) => {
    if (requireName && normalizePlaceName(entry.providerSnapshot?.displayName) !== candidateName) return closest;
    const distanceMeters = metersBetween(candidate.coordinates, entry.coordinates);
    return distanceMeters <= radiusMeters && (!closest || distanceMeters < closest.distanceMeters)
      ? { entry, distanceMeters } : closest;
  }, null);
}

function classifyGooglePlace(candidate, registry, radiusMeters = 2_000) {
  const explicitParent = candidate.classification?.suggestedParentStopId || null;
  const nearby = nearestRegistryMatch(candidate, registry, radiusMeters, false);
  return {
    ...candidate,
    classification: {
      entityType: "BOARDING_LOCATION",
      confidence: candidate.classification?.confidence || (nearby ? "HIGH" : "MEDIUM"),
      reasonCodes: [
        "GOOGLE_TRANSIT_PLACE",
        explicitParent || nearby ? "NEAR_CANONICAL_ROUTE_STOP" : "NO_CANONICAL_ROUTE_STOP_NEARBY",
      ],
      suggestedParentStopId: explicitParent || nearby?.entry.matchedStopId || nearby?.entry.resolvedStopId || null,
    },
    reviewStatus: "EXCLUDE",
  };
}

function duplicatesEarlier(candidate, index, all) {
  return all.slice(0, index).some((existing) => {
    const sameIdentity = candidateIdentity(existing) === candidateIdentity(candidate);
    const sameName = normalizePlaceName(existing.providerSnapshot.displayName) ===
      normalizePlaceName(candidate.providerSnapshot.displayName);
    const incompleteContext = !hasCompleteAdministrativeIdentity(existing) ||
      !hasCompleteAdministrativeIdentity(candidate);
    return sameIdentity || (sameName && incompleteContext &&
      metersBetween(existing.coordinates, candidate.coordinates) < 25_000);
  });
}

function deduplicateCandidates(candidates, registryMatchRadiusMeters, endpointContext = {}) {
  const endpointIds = new Set((endpointContext.ids || []).filter(Boolean).map(String));
  const endpointNames = new Set((endpointContext.names || []).map(normalizePlaceName).filter(Boolean));
  const terminalCoordinates = (endpointContext.terminalCoordinates || []).filter(Boolean);
  const outsideEndpointScope = candidates.filter((candidate) => {
    const stopId = candidate.matchedStopId || candidate.resolvedStopId;
    if (stopId && endpointIds.has(String(stopId))) return false;
    if (terminalCoordinates.some((point) => metersBetween(candidate.coordinates, point) < 2_000)) return false;
    return !endpointNames.has(normalizePlaceName(candidate.providerSnapshot?.displayName));
  });
  const registry = outsideEndpointScope.filter((candidate) =>
    candidate.providerSnapshot.provider === "PLATFORM_STOP"
  );
  const providerRank = (candidate) => candidate.providerSnapshot.provider === "PLATFORM_STOP" ? 0 : 1;
  const ordered = [...outsideEndpointScope].sort((left, right) =>
    providerRank(left) - providerRank(right) || left.distanceFromOriginMeters - right.distanceFromOriginMeters
  );
  const retained = ordered.filter((candidate, index, all) => !duplicatesEarlier(candidate, index, all))
    .filter((candidate) => candidate.providerSnapshot.provider !== "GOOGLE_PLACES" ||
      !registry.some((existing) => candidateIdentity(existing) === candidateIdentity(candidate)));
  return retained.map((candidate) => {
    if (candidate.providerSnapshot.provider !== "GOOGLE_PLACES") return candidate;
    if (candidate.classification?.entityType === "SERVICE_AREA" ||
      (candidate.providerSnapshot?.discoveryMethod === "REVERSE_GEOCODE" &&
        candidate.classification?.entityType === "ROUTE_STOP")) return candidate;
    const match = nearestRegistryMatch(candidate, registry, registryMatchRadiusMeters);
    const classified = classifyGooglePlace(candidate, registry);
    return match ? { ...classified, matchedStopId: match.entry.matchedStopId || match.entry.resolvedStopId } : classified;
  }).sort((left, right) => left.distanceFromOriginMeters - right.distanceFromOriginMeters);
}

module.exports = { classifyGooglePlace, deduplicateCandidates, normalizePlaceName };
