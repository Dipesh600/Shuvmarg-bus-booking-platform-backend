"use strict";

const { toIsoDate } = require("../common/read-date.mapper");
const { mapFleetDocumentDescriptors, calculateFleetDocumentSummary } = require("../common/fleet-document-descriptor.mapper");

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

function mapAdminFleetDetail(fleet) {
  if (!fleet) return null;
  const ownerUser = fleet.ownerId || {};
  const brand = fleet.brandId || {};
  const docDescriptors = mapFleetDocumentDescriptors(fleet);
  const docSummary = calculateFleetDocumentSummary(docDescriptors);

  return {
    fleetId: String(fleet._id || fleet.id),
    fleetCode: fleet.fleetId || null,
    owner: {
      ownerId: String(ownerUser._id || ownerUser.id || ownerUser),
      ownerCode: null,
      companyName: brand.brandName || ownerUser.name || "N/A",
      ownerName: ownerUser.name || "N/A",
      phone: ownerUser.phone || "N/A",
      email: ownerUser.email || "N/A",
    },
    vehicle: {
      busName: fleet.busName || "N/A",
      busNumber: fleet.busNumber || "N/A",
      busType: fleet.busType || "N/A",
      vehicleType: fleet.vehicleType || "BUS",
      totalSeats: fleet.totalSeats || 0,
      features: Array.isArray(fleet.features) ? fleet.features : [],
    },
    assignment: {
      route: fleet.route ? `${fleet.route.from} - ${fleet.route.to}` : "Unassigned",
      operatorId: brand?._id ? String(brand._id) : null,
      operatorName: brand.brandName || null,
    },
    status: fleet.status || "inactive",
    approvalStatus: fleet.approvalStatus || "PENDING",
    isApproved: fleet.isApproved || false,
    rejectionReason: fleet.rejectionReason || null,
    setupComplete: fleet.setupComplete || false,
    documents: docDescriptors,
    documentSummary: docSummary,
    review: {
      approvedBy: mapAdminReviewer(fleet.approvedBy),
      approvedAt: toIsoDate(fleet.approvedAt),
    },
    createdAt: toIsoDate(fleet.createdAt),
    updatedAt: toIsoDate(fleet.updatedAt),
  };
}

module.exports = {
  mapAdminFleetDetail,
};
