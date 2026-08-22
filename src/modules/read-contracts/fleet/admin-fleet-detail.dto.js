"use strict";

const { toIsoDate } = require("../common/read-date.mapper");
const { mapFleetDocumentDescriptors, calculateFleetDocumentSummary } = require("../common/fleet-document-descriptor.mapper");
const { mapRouteSetup } = require("./fleet-route-setup.dto");
const { mapFleetSeatLayout } = require("./fleet-seat-layout.dto");
const { mapFleetReviewRequirements } = require("../common/fleet-review-requirements.mapper");

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

function mapAdminFleetDetail(fleet, routeSetup, seatLayout = {}) {
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
      registrationYear: fleet.registrationYear || null,
      seatConfig: fleet.seatConfig || null,
      features: Array.isArray(fleet.amenityIds)
        ? fleet.amenityIds.map((item) => ({ id: String(item?._id || item), name: item?.name || "Amenity", icon: item?.icon || null }))
        : [],
    },
    assignment: {
      route: fleet.route ? `${fleet.route.from} - ${fleet.route.to}` : "Unassigned",
      operatorId: brand?._id ? String(brand._id) : null,
      operatorName: brand.brandName || null,
      operatorCode: brand.brandCode || null,
      operatorLogo: brand.logo || null,
      operatorBaseCity: brand.baseCity || null,
      operatorStatus: brand.status || null,
      corridor: fleet.corridorId
        ? {
            corridorId: String(fleet.corridorId._id || fleet.corridorId),
            code: fleet.corridorId.code || null,
            origin: fleet.corridorId.originId?.name || fleet.corridorId.originId?.city || null,
            destination: fleet.corridorId.destinationId?.name || fleet.corridorId.destinationId?.city || null,
            status: fleet.corridorId.status || null,
          }
        : null,
      routeRequest: fleet.routeRequestId
        ? {
            routeRequestId: String(fleet.routeRequestId._id || fleet.routeRequestId),
            origin: fleet.routeRequestId.originCity || null,
            destination: fleet.routeRequestId.destinationCity || null,
            viaStops: Array.isArray(fleet.routeRequestId.viaStops) ? fleet.routeRequestId.viaStops : [],
            status: fleet.routeRequestId.status || null,
          }
        : null,
    },
    status: fleet.status || "inactive",
    approvalStatus: fleet.approvalStatus || "PENDING",
    isApproved: fleet.approvalStatus === "APPROVED" || fleet.isApproved || false,
    rejectionReason: fleet.rejectionReason || null,
    setupComplete: fleet.setupComplete || false,
    route: mapRouteSetup(routeSetup),
    documents: docDescriptors,
    documentSummary: docSummary,
    reviewRequirements: mapFleetReviewRequirements(fleet),
    seatLayout: mapFleetSeatLayout(seatLayout.assignment, seatLayout.revision),
    review: {
      approvedBy: mapAdminReviewer(fleet.approvedBy),
      rejectedBy: mapAdminReviewer(fleet.rejectedBy),
      submittedAt: toIsoDate(fleet.submittedAt),
      approvedAt: toIsoDate(fleet.approvedAt),
      rejectedAt: toIsoDate(fleet.rejectedAt),
      rejectionReason: fleet.rejectionReason || null,
    },
    createdAt: toIsoDate(fleet.createdAt),
    updatedAt: toIsoDate(fleet.updatedAt),
  };
}

module.exports = {
  mapAdminFleetDetail,
};
