"use strict";

const { toIsoDate } = require("./read-date.mapper");

const FLEET_DOCUMENT_SLOTS = Object.freeze([
  "fleetImages",
  "fitnessCert",
  "insurance",
  "bluebook",
  "routePermit",
]);

function extractFleetSlotEvidence(fleet, slot) {
  if (slot === "fleetImages") {
    const images = Array.isArray(fleet?.fleetImages) ? fleet.fleetImages : [];
    return {
      present: images.length > 0,
      count: images.length,
    };
  }

  const doc = fleet?.fleetDocuments?.[slot];
  if (!doc || typeof doc !== "object") {
    return { present: false };
  }

  const hasUrl = Boolean(doc.url || doc.objectKey || doc.storageKey);
  return {
    present: hasUrl,
    validTill: toIsoDate(doc.validTill),
    policyNumber: doc.policyNumber || null,
  };
}

function mapFleetSlotDescriptor(fleet, slot) {
  const evidence = extractFleetSlotEvidence(fleet, slot);
  const review = fleet?.documentReviews?.[slot] || {};

  const status = evidence.present ? String(review.status || "PENDING").toUpperCase() : "MISSING";
  const reason = status === "REJECTED" ? review.reason || review.rejectionReason || null : null;

  return {
    slot,
    present: evidence.present,
    status,
    reason,
    validTill: evidence.validTill || null,
    policyNumber: evidence.policyNumber || null,
    count: evidence.count !== undefined ? evidence.count : (evidence.present ? 1 : 0),
  };
}

function mapFleetDocumentDescriptors(fleet) {
  const map = {};
  for (const slot of FLEET_DOCUMENT_SLOTS) {
    map[slot] = mapFleetSlotDescriptor(fleet, slot);
  }
  return map;
}

function calculateFleetDocumentSummary(descriptors) {
  let present = 0;
  let missing = 0;
  let pending = 0;
  let approved = 0;
  let rejected = 0;

  for (const slot of FLEET_DOCUMENT_SLOTS) {
    const desc = descriptors[slot];
    if (desc.present) {
      present += 1;
      if (desc.status === "APPROVED") approved += 1;
      else if (desc.status === "REJECTED") rejected += 1;
      else pending += 1;
    } else {
      missing += 1;
    }
  }

  return {
    totalSlots: FLEET_DOCUMENT_SLOTS.length,
    present,
    missing,
    pending,
    approved,
    rejected,
  };
}

module.exports = {
  FLEET_DOCUMENT_SLOTS,
  mapFleetDocumentDescriptors,
  calculateFleetDocumentSummary,
};
