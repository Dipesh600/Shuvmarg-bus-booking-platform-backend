"use strict";

const { toIsoDate } = require("../common/read-date.mapper");
const { mapFleetDocumentDescriptors, calculateFleetDocumentSummary } = require("../common/fleet-document-descriptor.mapper");
const { mapRouteSetup } = require("./fleet-route-setup.dto");
const { mapFleetSeatLayout } = require("./fleet-seat-layout.dto");

function mapBusOwnerFleetDetail(fleet, routeSetup, seatLayout = {}) {
  if (!fleet) return null;
  const docDescriptors = mapFleetDocumentDescriptors(fleet);
  const docSummary = calculateFleetDocumentSummary(docDescriptors);

  return {
    fleetId: String(fleet._id || fleet.id),
    fleetCode: fleet.fleetId || null,
    brandId: fleet.brandId ? String(fleet.brandId._id || fleet.brandId) : null,
    busName: fleet.busName || "N/A",
    busNumber: fleet.busNumber || "N/A",
    busType: fleet.busType || "N/A",
    vehicleType: fleet.vehicleType || "BUS",
    totalSeats: fleet.totalSeats || 0,
    registrationYear: fleet.registrationYear || null,
    features: Array.isArray(fleet.features) ? fleet.features : [],
    vehicle: {
      busName: fleet.busName || "N/A",
      busNumber: fleet.busNumber || "N/A",
      busType: fleet.busType || "N/A",
      vehicleType: fleet.vehicleType || "BUS",
      totalSeats: fleet.totalSeats || 0,
      registrationYear: fleet.registrationYear || null,
      features: Array.isArray(fleet.features) ? fleet.features : [],
    },
    route: mapRouteSetup(routeSetup),
    assignment: {
      route: routeSetup
        ? `${mapRouteSetup(routeSetup)?.origin || "?"} - ${mapRouteSetup(routeSetup)?.destination || "?"}`
        : fleet.route
        ? `${fleet.route.from} - ${fleet.route.to}`
        : "Unassigned",
    },
    status: fleet.status || "inactive",
    approvalStatus: fleet.approvalStatus || "DRAFT",
    isApproved: fleet.approvalStatus === "APPROVED" || fleet.isApproved || false,
    rejectionReason: fleet.rejectionReason || null,
    setupComplete: fleet.setupComplete || false,
    documents: docDescriptors,
    documentSummary: docSummary,
    seatLayout: mapFleetSeatLayout(seatLayout.assignment, seatLayout.revision),
    review: {
      submittedAt: toIsoDate(fleet.submittedAt),
      approvedAt: toIsoDate(fleet.approvedAt),
      rejectedAt: toIsoDate(fleet.rejectedAt),
      rejectionReason: fleet.rejectionReason || null,
    },
    submittedAt: toIsoDate(fleet.submittedAt),
    createdAt: toIsoDate(fleet.createdAt),
    updatedAt: toIsoDate(fleet.updatedAt),
  };
}

module.exports = {
  mapBusOwnerFleetDetail,
};
