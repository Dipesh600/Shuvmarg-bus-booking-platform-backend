"use strict";

const errors = require("./fleet-document.errors");

function enforceUploadPolicy(fleet, slot) {
  if (!fleet) throw errors.notFound();
  if (fleet.approvalStatus === "PENDING") {
    throw errors.forbidden("Documents cannot be uploaded or replaced while fleet is under review.");
  }
  if (fleet.approvalStatus === "APPROVED") {
    throw errors.approvedImmutable();
  }

  if (fleet.approvalStatus === "REJECTED") {
    const slotReview = fleet.documentReviews?.[slot];
    if (slotReview && slotReview.status === "approved") {
      throw errors.slotNotRejected(slot);
    }
  }
}

function hasExistingDocument(fleet, slot) {
  if (slot === "fleetImages") {
    return Array.isArray(fleet.fleetImages) && fleet.fleetImages.length > 0;
  }
  const doc = fleet.fleetDocuments?.[slot];
  return Boolean(doc?.objectKey || doc?.url);
}

function classifyAction(fleet, slot) {
  if (fleet.approvalStatus === "REJECTED") {
    return "RESUBMITTED";
  }
  return hasExistingDocument(fleet, slot) ? "REPLACED" : "UPLOADED";
}

function buildUpdateQuery({ fleet, slot, actor, metadata, newAssets, auditEvent }) {
  const now = auditEvent.occurredAt || new Date();
  const setFields = {};
  const reviewStatus = fleet.approvalStatus === "PENDING" ? "pending" : "not_submitted";

  if (slot === "fleetImages") {
    setFields.fleetImages = newAssets.map((asset) => ({
      imageId: asset.imageId,
      objectKey: asset.objectKey,
      mimeType: asset.mimeType,
      size: asset.size,
      uploadedAt: now,
    }));
    setFields["documentReviews.fleetImages"] = {
      status: reviewStatus,
      reason: null,
      reviewedBy: null,
      reviewedAt: null,
    };
  } else {
    const slotPath = `fleetDocuments.${slot}`;
    setFields[`${slotPath}.objectKey`] = newAssets[0].objectKey;
    setFields[`${slotPath}.mimeType`] = newAssets[0].mimeType;
    setFields[`${slotPath}.size`] = newAssets[0].size;
    setFields[`${slotPath}.uploadedAt`] = now;
    if (slot === "fitnessCert" && metadata.validTill !== undefined) {
      setFields[`${slotPath}.validTill`] = metadata.validTill;
    }
    if (slot === "insurance") {
      if (metadata.policyNumber !== undefined) setFields[`${slotPath}.policyNumber`] = metadata.policyNumber;
      if (metadata.validTill !== undefined) setFields[`${slotPath}.validTill`] = metadata.validTill;
    }
    if (slot === "routePermit" && metadata.validTill !== undefined) {
      setFields[`${slotPath}.validTill`] = metadata.validTill;
    }
    setFields[`documentReviews.${slot}`] = {
      status: reviewStatus,
      reason: null,
      reviewedBy: null,
      reviewedAt: null,
    };
  }

  const pushFields = { fleetDocumentAuditHistory: auditEvent };

  return {
    $set: setFields,
    $push: pushFields,
    $inc: { __v: 1 },
  };
}

module.exports = {
  enforceUploadPolicy,
  classifyAction,
  hasExistingDocument,
  buildUpdateQuery,
};
