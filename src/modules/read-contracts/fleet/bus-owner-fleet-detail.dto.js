"use strict";

const { toIsoDate } = require("../common/read-date.mapper");
const { mapFleetDocumentDescriptors, calculateFleetDocumentSummary } = require("../common/fleet-document-descriptor.mapper");

function mapBusOwnerFleetDetail(fleet) {
  if (!fleet) return null;
  const docDescriptors = mapFleetDocumentDescriptors(fleet);
  const docSummary = calculateFleetDocumentSummary(docDescriptors);

  return {
    fleetId: String(fleet._id || fleet.id),
    fleetCode: fleet.fleetId || null,
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
    },
    status: fleet.status || "inactive",
    approvalStatus: fleet.approvalStatus || "PENDING",
    isApproved: fleet.isApproved || false,
    rejectionReason: fleet.rejectionReason || null,
    setupComplete: fleet.setupComplete || false,
    documents: docDescriptors,
    documentSummary: docSummary,
    createdAt: toIsoDate(fleet.createdAt),
    updatedAt: toIsoDate(fleet.updatedAt),
  };
}

module.exports = {
  mapBusOwnerFleetDetail,
};
