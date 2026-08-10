"use strict";

const { toIsoDate } = require("../common/read-date.mapper");
const { mapFleetDocumentDescriptors, calculateFleetDocumentSummary } = require("../common/fleet-document-descriptor.mapper");

function mapAdminFleetListItem(fleet) {
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
    },
    brand: brand?._id ? {
      brandId: String(brand._id),
      brandCode: brand.brandCode || null,
      brandName: brand.brandName || "N/A",
    } : null,
    busName: fleet.busName || "N/A",
    busNumber: fleet.busNumber || "N/A",
    busType: fleet.busType || "N/A",
    vehicleType: fleet.vehicleType || "BUS",
    totalSeats: fleet.totalSeats || 0,
    status: fleet.status || "inactive",
    approvalStatus: fleet.approvalStatus || "PENDING",
    isApproved: fleet.isApproved || false,
    setupComplete: fleet.setupComplete || false,
    documentSummary: docSummary,
    createdAt: toIsoDate(fleet.createdAt),
    updatedAt: toIsoDate(fleet.updatedAt),
  };
}

module.exports = {
  mapAdminFleetListItem,
};
