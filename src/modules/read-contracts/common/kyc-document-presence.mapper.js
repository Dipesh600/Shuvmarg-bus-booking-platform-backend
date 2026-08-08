"use strict";

const { toIsoDate } = require("./read-date.mapper");
const { deriveKycDocumentState } = require("../../../contracts");

function hasDocumentUrls(doc) {
  if (!doc) return false;
  if (Array.isArray(doc.documentUrls)) return doc.documentUrls.length > 0;
  if (typeof doc.url === "string") return Boolean(doc.url);
  return false;
}

function mapSingularKycDescriptor(owner, slot) {
  const doc = owner?.[slot];
  const present = hasDocumentUrls(doc);
  const verified = Boolean(doc?.verified);
  const rejectionReason = doc?.rejectionReason || null;
  const fileCount = Array.isArray(doc?.documentUrls)
    ? doc.documentUrls.length
    : (present ? 1 : 0);
  const state = deriveKycDocumentState({ present, verified, rejectionReason });

  const result = {
    slot,
    present,
    available: present,
    fileCount,
    verified,
    rejectionReason,
    state,
  };

  if (slot === "taxRegistration") {
    result.panNumber = doc?.panNumber || null;
    result.vatNumber = doc?.vatNumber || null;
    result.registrationNumber = doc?.registrationNumber || null;
  } else if (slot === "transportLicense") {
    result.licenseNumber = doc?.licenseNumber || null;
    result.validTill = toIsoDate(doc?.validTill);
  }

  return result;
}

module.exports = {
  hasDocumentUrls,
  mapSingularKycDescriptor,
};
