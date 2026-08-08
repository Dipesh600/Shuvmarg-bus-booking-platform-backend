"use strict";

const { toIsoDate } = require("../common/read-date.mapper");
const { mapKycDocumentDescriptors, calculateKycDocumentSummary } = require("../common/kyc-document-descriptor.mapper");

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

function mapAdminBusOwnerDetail(owner, fleets = []) {
  if (!owner) return null;
  const user = owner.user || {};
  const docDescriptors = mapKycDocumentDescriptors(owner);
  const docSummary = calculateKycDocumentSummary(docDescriptors);

  const formattedFleets = Array.isArray(fleets)
    ? fleets.map((f) => ({
        fleetId: String(f._id || f.id),
        fleetCode: f.fleetId || null,
        busNumber: f.busNumber || "N/A",
        busType: f.busType || "N/A",
        route: f.route ? `${f.route.from} - ${f.route.to}` : "Unassigned",
        status: f.status || "inactive",
        capacity: f.totalSeats || 0,
      }))
    : [];

  return {
    ownerId: String(owner._id || owner.id),
    ownerCode: owner.busOwnerId || null,
    userId: user._id ? String(user._id) : (owner.user ? String(owner.user) : null),
    profile: {
      name: user.name || "N/A",
      email: user.email || "N/A",
      phone: user.phone || "N/A",
      profilePicture: user.profilePicture || null,
      status: user.status || "active",
    },
    business: {
      companyName: owner.companyName || owner.companyRegistration?.companyName || "N/A",
    },
    bank: {
      present: Boolean(owner.bankDetails?.accountNumber || owner.bankDetails?.bankName),
      bankName: owner.bankDetails?.bankName || null,
      accountNumber: owner.bankDetails?.accountNumber || null,
      accountHolderName: owner.bankDetails?.accountHolderName || null,
      branchName: owner.bankDetails?.branchName || null,
      swiftCode: owner.bankDetails?.swiftCode || null,
    },
    documents: docDescriptors,
    documentSummary: docSummary,
    verificationStatus: owner.verificationStatus || "pending",
    rejectionReason: owner.rejectionReason || null,
    review: {
      approvedBy: mapAdminReviewer(owner.approvedBy),
      approvedAt: toIsoDate(owner.approvedAt),
      reviewedBy: mapAdminReviewer(owner.kycReview?.reviewedBy),
      reviewedAt: toIsoDate(owner.kycReview?.reviewedAt),
    },
    fleetSummary: {
      fleetSize: formattedFleets.length,
      buses: formattedFleets,
    },
    createdAt: toIsoDate(owner.createdAt),
    updatedAt: toIsoDate(owner.updatedAt),
  };
}

module.exports = {
  mapAdminBusOwnerDetail,
};
