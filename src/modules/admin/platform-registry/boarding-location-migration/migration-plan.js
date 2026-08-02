"use strict";

function groupBrands(brands) {
  const byOwner = new Map();
  for (const brand of brands) {
    const key = String(brand.ownerId);
    byOwner.set(key, [...(byOwner.get(key) || []), brand]);
  }
  return byOwner;
}

function existingMaps(locations, assignments) {
  return {
    byIdentity: new Map(locations.map((item) => [
      item._normalizedIdentity, item,
    ])),
    byLegacy: new Map(locations
      .filter((item) => item.legacySource?.id)
      .map((item) => [
        `${item.legacySource.model}:${item.legacySource.id}`, item,
      ])),
    assignmentKeys: new Set(assignments.map((item) =>
      `${item.brandId}:${item.boardingLocationId}`
    )),
  };
}

function assignmentFor(candidate, locationId, brandsByOwner, errors) {
  if (!candidate.ownerId) return null;
  const brands = brandsByOwner.get(String(candidate.ownerId)) || [];
  if (brands.length !== 1) {
    errors.push({
      legacyKey: candidate.legacyKey,
      code: "AMBIGUOUS_OPERATOR_BRAND",
      message: brands.length === 0
        ? "No operator brand matches the legacy owner."
        : "More than one operator brand matches the legacy owner.",
    });
    return null;
  }
  return {
    brandId: brands[0]._id,
    boardingLocationId: locationId,
    usage: candidate.usage,
    contactPhone: candidate.contactPhone,
    status: candidate.locationData.status === "ACTIVE"
      ? "PENDING_REVIEW" : "INACTIVE",
  };
}

function buildMigrationPlan({ candidates, locations, assignments, brands }) {
  const maps = existingMaps(locations, assignments);
  const brandsByOwner = groupBrands(brands);
  const identities = new Map();
  const plan = {
    locationsToCreate: [], assignmentsToCreate: [], unchanged: [],
    syntheticFallbacks: [], invalidRecords: [], identityConflicts: [],
  };
  for (const candidate of candidates) {
    if (candidate.syntheticFallback) {
      plan.syntheticFallbacks.push(candidate.legacyKey);
      continue;
    }
    const duplicate = identities.get(candidate.identity);
    if (duplicate && duplicate !== candidate.legacyKey) {
      plan.identityConflicts.push({
        identity: candidate.identity,
        legacyRecords: [duplicate, candidate.legacyKey],
      });
      continue;
    }
    identities.set(candidate.identity, candidate.legacyKey);
    const byLegacy = maps.byLegacy.get(candidate.legacyKey);
    const byIdentity = maps.byIdentity.get(candidate.identity);
    if (byLegacy && byLegacy._normalizedIdentity !== candidate.identity) {
      plan.invalidRecords.push({
        legacyKey: candidate.legacyKey,
        code: "LEGACY_MAPPING_IDENTITY_MISMATCH",
        message: "The existing canonical location no longer matches its legacy source.",
      });
      continue;
    }
    if (byLegacy && byIdentity && String(byLegacy._id) !== String(byIdentity._id)) {
      plan.identityConflicts.push({
        identity: candidate.identity,
        legacyRecords: [candidate.legacyKey, String(byIdentity._id)],
      });
      continue;
    }
    if (byIdentity && !byLegacy) {
      plan.identityConflicts.push({
        identity: candidate.identity,
        legacyRecords: [candidate.legacyKey, String(byIdentity._id)],
      });
      continue;
    }
    const location = byLegacy || candidate.locationData;
    if (!byLegacy) plan.locationsToCreate.push(location);
    else plan.unchanged.push(candidate.legacyKey);
    const assignment = assignmentFor(
      candidate, location._id, brandsByOwner, plan.invalidRecords
    );
    if (assignment) {
      const key = `${assignment.brandId}:${assignment.boardingLocationId}`;
      if (!maps.assignmentKeys.has(key)) plan.assignmentsToCreate.push(assignment);
    }
  }
  plan.safeToApply = plan.invalidRecords.length === 0 &&
    plan.identityConflicts.length === 0;
  return plan;
}

module.exports = { buildMigrationPlan };
