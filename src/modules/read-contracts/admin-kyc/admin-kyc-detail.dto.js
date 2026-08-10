"use strict";

const { toIsoDate } = require("../common/read-date.mapper");
const { mapKycDocumentDescriptors, calculateKycDocumentSummary } = require("../common/kyc-document-descriptor.mapper");
const { isKycMalwareScanReady } = require("../../bus-owner/kyc-document-read/kyc-document-reference.service");

function mapAdminReviewer(reviewer) {
  if (!reviewer) return null;
  if (typeof reviewer === "object" && reviewer._id) {
    return {
      adminId: String(reviewer._id),
      name: reviewer.name || reviewer.email || "Admin",
    };
  }
  return { adminId: String(reviewer), name: "Admin" };
}

function mapAdminKycDetail(owner) {
  if (!owner) return null;
  const user = owner.user || {};
  const docDescriptors = mapKycDocumentDescriptors(owner);
  const securityScanReady = isKycMalwareScanReady(owner);
  if (!securityScanReady) {
    for (const descriptor of Object.values(docDescriptors)) {
      descriptor.available = false;
      if (Array.isArray(descriptor.items)) {
        descriptor.items = descriptor.items.map((item) => ({ ...item, available: false }));
      }
    }
  }
  const docSummary = calculateKycDocumentSummary(docDescriptors);

  return {
    ownerId: String(owner._id || owner.id),
    ownerCode: owner.busOwnerId || null,
    userId: user._id ? String(user._id) : (owner.user ? String(owner.user) : null),
    owner: {
      name: user.name || "N/A",
      email: user.email || "N/A",
      phone: user.phone || "N/A",
      companyName: owner.companyName || owner.companyRegistration?.companyName || "N/A",
      registeredAddress: owner.registeredAddress
        ? {
            tole: owner.registeredAddress.tole || owner.registeredAddress.addressLine1 || null,
            wardNumber: owner.registeredAddress.wardNumber || null,
            municipality: owner.registeredAddress.municipality || null,
            district: owner.registeredAddress.district || null,
            province: owner.registeredAddress.province || null,
            postalCode: owner.registeredAddress.postalCode || null,
            country: owner.registeredAddress.country || "Nepal",
          }
        : null,
    },
    bank: {
      bankName: owner.bankDetails?.bankName || null,
      accountNumber: owner.bankDetails?.accountNumber || null,
      accountHolderName: owner.bankDetails?.accountHolderName || null,
      branchName: owner.bankDetails?.branchName || null,
      swiftCode: owner.bankDetails?.swiftCode || null,
    },
    verificationStatus: owner.verificationStatus || "pending",
    documentSecurity: {
      status: owner.kycSecurity?.malwareScanStatus || "quarantined",
      scannedAt: toIsoDate(owner.kycSecurity?.scannedAt),
      availableToReview: securityScanReady,
    },
    rejectionReason: owner.rejectionReason || null,
    documents: docDescriptors,
    documentSummary: docSummary,
    review: {
      approvedBy: mapAdminReviewer(owner.approvedBy),
      approvedAt: toIsoDate(owner.approvedAt),
      reviewedBy: mapAdminReviewer(owner.kycReview?.reviewedBy),
      reviewedAt: toIsoDate(owner.kycReview?.reviewedAt),
    },
    createdAt: toIsoDate(owner.createdAt),
    updatedAt: toIsoDate(owner.updatedAt),
  };
}

module.exports = {
  mapAdminKycDetail,
};
