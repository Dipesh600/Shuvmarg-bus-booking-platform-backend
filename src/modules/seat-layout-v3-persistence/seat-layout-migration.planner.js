"use strict";

const {
  adaptLegacySeatLayout, seatLayoutV3Fingerprint,
} = require("../../domain/seat-layout-v3");

function planLegacyRecord(record) {
  try {
    const adapted = adaptLegacySeatLayout(record.seatConfig);
    return {
      sourceId: String(record._id || record.id),
      sourceType: record.sourceType,
      status: "READY",
      layout: adapted.layout,
      totalPlaces: adapted.totalPlaces,
      physicalFingerprint: seatLayoutV3Fingerprint(adapted.layout),
      initialAvailability: adapted.initialAvailability,
    };
  } catch (error) {
    return {
      sourceId: String(record._id || record.id),
      sourceType: record.sourceType,
      status: "BLOCKED",
      error: { code: error.code || "LEGACY_LAYOUT_INVALID", message: error.message, path: error.details?.path },
    };
  }
}

function planLegacySeatLayoutMigration(records) {
  const plans = records.map(planLegacyRecord);
  return {
    scanned: plans.length,
    ready: plans.filter((plan) => plan.status === "READY").length,
    blocked: plans.filter((plan) => plan.status === "BLOCKED").length,
    plans,
  };
}

module.exports = { planLegacyRecord, planLegacySeatLayoutMigration };
