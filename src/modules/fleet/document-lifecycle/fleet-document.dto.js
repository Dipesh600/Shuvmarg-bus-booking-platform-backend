"use strict";

function buildUploadResponse({ fleetId, slot, action, documentStatus, fleetApprovalStatus, operationalStatus, uploadedAt }) {
  return {
    success: true,
    message: "Fleet document uploaded successfully.",
    data: {
      fleetId: String(fleetId),
      slot,
      action,
      documentStatus,
      fleetApprovalStatus,
      operationalStatus,
      uploadedAt: uploadedAt ? new Date(uploadedAt).toISOString() : new Date().toISOString(),
    },
  };
}

function buildReadResponse({ fleetId, slot, readUrl, expiresAt }) {
  return {
    success: true,
    data: {
      fleetId: String(fleetId),
      slot,
      readUrl,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    },
  };
}

function buildDocumentDescriptor(doc, review) {
  if (doc && typeof doc === "object" && typeof doc.present === "boolean") {
    return doc;
  }
  const hasObjectKey = Boolean(doc?.objectKey || doc?.url);
  return {
    present: hasObjectKey,
    status: review?.status || "pending",
    reason: review?.reason || null,
    uploadedAt: doc?.uploadedAt ? new Date(doc.uploadedAt).toISOString() : null,
  };
}

function sanitizeFleetDocumentDescriptors(fleetDoc) {
  if (!fleetDoc) return fleetDoc;
  const fleet = typeof fleetDoc.toObject === "function" ? fleetDoc.toObject() : { ...fleetDoc };
  const docs = fleet.fleetDocuments || {};
  const reviews = fleet.documentReviews || {};

  fleet.fleetDocuments = {
    fitnessCert: buildDocumentDescriptor(docs.fitnessCert, reviews.fitnessCert),
    insurance: buildDocumentDescriptor(docs.insurance, reviews.insurance),
    bluebook: buildDocumentDescriptor(docs.bluebook, reviews.bluebook),
    routePermit: buildDocumentDescriptor(docs.routePermit, reviews.routePermit),
  };

  const rawImages = fleet.fleetImages || [];
  fleet.fleetImages = typeof rawImages === "object" && !Array.isArray(rawImages) && rawImages.count !== undefined
    ? rawImages
    : {
        count: Array.isArray(rawImages) ? rawImages.length : 0,
        status: reviews.fleetImages?.status || "pending",
        reason: reviews.fleetImages?.reason || null,
      };

  return fleet;
}

module.exports = {
  buildUploadResponse,
  buildReadResponse,
  buildDocumentDescriptor,
  sanitizeFleetDocumentDescriptors,
};
