"use strict";

const { createStop } = require("../stop-registry.service.js");
const { routeVariantError } = require("../route-variant-errors.js");
const { sameId } = require("./shared.js");
const { resolveEligibleStops } = require("./candidate-policy.service.js");
const { findReusableStopByIdentity } = require("./stop-identity-reuse.service.js");

function assertCandidatesReady(candidates, variant) {
  // Bus stands/parks are boarding-location evidence, never route sequence
  // members and therefore never blockers for saving the variant.
  const routeCandidates = candidates.filter(
    (candidate) => candidate.classification?.entityType !== "BOARDING_LOCATION"
  );
  const unresolved = routeCandidates.filter((candidate) => candidate.reviewStatus === "UNREVIEWED");
  if (unresolved.length) {
    throw routeVariantError("UNREVIEWED_STOP_CANDIDATES", "Review every suggested location before saving the stop sequence.", 409, {
      candidateIds: unresolved.map((candidate) => String(candidate._id)),
    });
  }
  const included = routeCandidates.filter((candidate) => candidate.reviewStatus !== "EXCLUDE");
  const hasOriginTerminal = Boolean(variant.originTerminalStopId);
  const hasDestinationTerminal = Boolean(variant.destinationTerminalStopId);
  if (hasOriginTerminal !== hasDestinationTerminal) {
    throw routeVariantError("INCOMPLETE_VARIANT_TERMINALS", "A variant must define both physical terminals or neither.");
  }
  if (included.length < 2) {
    throw routeVariantError("VARIANT_STOP_SEQUENCE_TOO_SHORT", "Keep at least two route stops before saving the path.");
  }
  if (hasOriginTerminal && (!included[0].isTerminal || !included.at(-1).isTerminal ||
      !sameId(included[0].resolvedStopId, variant.originTerminalStopId) ||
      !sameId(included.at(-1).resolvedStopId, variant.destinationTerminalStopId))) {
    throw routeVariantError("VARIANT_TERMINAL_SEQUENCE_MISMATCH", "The reviewed route must begin and end at the selected physical terminals.");
  }
  return included;
}

async function resolveCommittedStops(candidates, adminId, options = {}) {
  const createCanonicalStop = options.createStop || createStop;
  const findIdentityStop = options.findStopByIdentity || findReusableStopByIdentity;
  const resolveStops = options.resolveEligibleStops || (options.resolveEligibleStop
    ? (requests) => Promise.all(requests.map(({ stopId, coordinates }) =>
        options.resolveEligibleStop(stopId, coordinates, options)))
    : resolveEligibleStops);
  const reusable = candidates.filter((candidate) =>
    candidate.reviewStatus === "USE_EXISTING" || candidate.resolvedStopId
  );
  const reusableStops = await resolveStops(reusable.map((candidate) => ({
    stopId: candidate.resolvedStopId, coordinates: candidate.coordinates,
  })), options);
  let reusableIndex = 0;
  const stops = [];
  for (const candidate of candidates) {
    if (candidate.reviewStatus === "USE_EXISTING" || candidate.resolvedStopId) {
      stops.push(reusableStops[reusableIndex]);
      reusableIndex += 1;
      continue;
    }
    const proposed = candidate.proposedStop?.toObject ? candidate.proposedStop.toObject() : candidate.proposedStop;
    const input = {
      ...proposed, coordinates: candidate.coordinates, isSearchable: proposed.isSearchable !== false,
      isRouteStop: true, verificationStatus: "VERIFIED", source: "MANUAL", status: "ACTIVE",
    };
    let created = await findIdentityStop(input, options);
    if (!created) {
      try {
        created = await createCanonicalStop(input, adminId, options);
      } catch (error) {
        if (error.code !== "STOP_IDENTITY_CONFLICT") throw error;
        // A concurrent commit may have inserted the same canonical Stop after
        // our preflight. The database unique index remains the final guard.
        created = await findIdentityStop(input, options);
        if (!created) throw error;
      }
    } else {
      candidate.reviewStatus = "USE_EXISTING";
      candidate.matchedStopId = created._id;
      candidate.proposedStop = undefined;
    }
    candidate.resolvedStopId = created._id;
    await candidate.save(options.session ? { session: options.session } : undefined);
    stops.push(created);
  }
  return stops;
}

function buildRouteStopSequence(candidates, stops) {
  return candidates.map((candidate, index) => ({
    stopCode: stops[index].code, sequence: index + 1, isMajor: candidate.isTerminal,
    distanceFromOriginKm: Number.isFinite(candidate.distanceFromOriginMeters) ? Math.round(candidate.distanceFromOriginMeters / 100) / 10 : null,
    durationFromOriginMins: Number.isFinite(candidate.durationFromOriginSeconds) ? Math.round(candidate.durationFromOriginSeconds / 60) : 0,
  }));
}

module.exports = { assertCandidatesReady, buildRouteStopSequence, resolveCommittedStops };
