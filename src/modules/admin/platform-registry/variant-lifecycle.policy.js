"use strict";

const {
  getVariantReferenceCounts,
  getVariantOperationalReferenceCounts,
  hasExternalReferences,
  hasOperationalReferences,
} = require("./variant-reference.policy.js");
const { routeVariantError } = require("./route-variant-errors.js");

const VARIANT_WRITE_CONTEXT = Object.freeze({
  LEGACY_ADMIN_ENDPOINT: "LEGACY_ADMIN_ENDPOINT",
  INTERNAL_WORKFLOW: "INTERNAL_WORKFLOW",
});

const STATUS_TRANSITIONS = Object.freeze({
  DRAFT: new Set(["DRAFT", "ACTIVE", "ARCHIVED"]),
  ACTIVE: new Set(["ACTIVE", "INACTIVE"]),
  INACTIVE: new Set(["INACTIVE", "ACTIVE", "ARCHIVED"]),
  ARCHIVED: new Set(["ARCHIVED"]),
});

const CONFIGURATION_FIELDS = ["name", "type", "distanceKm", "durationMinutes"];

function normalizedStatus(value) {
  return String(value || "").trim().toUpperCase();
}

function hasConfigurationChange(data = {}) {
  return CONFIGURATION_FIELDS.some((field) => data[field] !== undefined);
}

function isConfigurationMutableStatus(status) {
  return !["ACTIVE", "INACTIVE", "ARCHIVED"].includes(normalizedStatus(status));
}

function assertLegacyVariantCreateAllowed(data = {}) {
  if (data.definitionSource && data.definitionSource !== "ADMIN") {
    throw routeVariantError(
      "VARIANT_DRAFT_WORKFLOW_REQUIRED",
      "Map-reviewed variants must be created through the corridor draft workflow.",
      409
    );
  }
}

function assertVariantConfigurationMutable(variant, data = {}) {
  if (hasConfigurationChange(data) && !isConfigurationMutableStatus(variant.status)) {
    throw routeVariantError(
      "VARIANT_CONFIGURATION_LOCKED",
      "Only a draft variant can have its route definition changed. Create a new draft to revise an operational variant.",
      409
    );
  }
}

function assertMapReviewEndpointAccess(variant, writeContext) {
  if (
    writeContext === VARIANT_WRITE_CONTEXT.LEGACY_ADMIN_ENDPOINT &&
    variant.definitionSource === "GOOGLE_ROUTE_REVIEW"
  ) {
    throw routeVariantError(
      "VARIANT_DRAFT_WORKFLOW_REQUIRED",
      "This map-reviewed variant can only be changed through the corridor draft workflow.",
      409
    );
  }
}

async function assertVariantStatusTransition(variant, requestedStatus) {
  if (requestedStatus === undefined) return;

  const from = normalizedStatus(variant.status) || "DRAFT";
  const to = normalizedStatus(requestedStatus);
  if (!STATUS_TRANSITIONS[from]?.has(to)) {
    throw routeVariantError(
      "INVALID_VARIANT_STATUS_TRANSITION",
      `A ${from || "unknown"} variant cannot transition to ${to || "an empty status"}.`,
      409,
      { from, to }
    );
  }
  if (from === to) return;

  const deactivatingLiveVariant = from === "ACTIVE" && to === "INACTIVE";
  const archivingVariant = to === "ARCHIVED";
  if (deactivatingLiveVariant) {
    const counts = await getVariantOperationalReferenceCounts(variant._id);
    if (hasOperationalReferences(counts)) {
      throw routeVariantError(
        "VARIANT_RETIREMENT_BLOCKED",
        "This variant still has live operational references. Move schedules, route patterns, agent access, and future trips before retiring it.",
        409,
        counts
      );
    }
    return;
  }
  if (!archivingVariant) return;

  const counts = await getVariantReferenceCounts(variant._id);
  if (hasExternalReferences(counts)) {
    throw routeVariantError(
      "VARIANT_STATUS_CHANGE_BLOCKED",
      "This referenced variant cannot be retired or archived. Preserve it and create a replacement draft instead.",
      409,
      counts
    );
  }
}

function assertVariantSequenceMutable(variant, writeContext) {
  assertMapReviewEndpointAccess(variant, writeContext);
  if (!isConfigurationMutableStatus(variant.status)) {
    throw routeVariantError(
      "VARIANT_SEQUENCE_LOCKED",
      "Only a draft variant can have its route-stop sequence replaced. Create a replacement draft for an operational variant.",
      409
    );
  }
}

module.exports = {
  CONFIGURATION_FIELDS,
  STATUS_TRANSITIONS,
  VARIANT_WRITE_CONTEXT,
  assertLegacyVariantCreateAllowed,
  assertMapReviewEndpointAccess,
  assertVariantConfigurationMutable,
  assertVariantSequenceMutable,
  assertVariantStatusTransition,
  hasConfigurationChange,
  isConfigurationMutableStatus,
};
