"use strict";

const BusModel = require("../../../models/fleetModel");
const BusOwnerModel = require("../../../models/busOwnerModel");
const OperatorBrandModel = require("../../../models/operatorBrandModel");
const FleetSeatLayoutAssignmentModel = require("../../../models/fleetSeatLayoutAssignmentModel");
const SeatLayoutRevisionModel = require("../../../models/seatLayoutRevisionModel");

async function runBrandFleetPreflightAudit(deps = {}) {
  const Bus = deps.Bus || BusModel;
  const BusOwner = deps.BusOwner || BusOwnerModel;
  const OperatorBrand = deps.OperatorBrand || OperatorBrandModel;
  const FleetSeatLayoutAssignment = deps.FleetSeatLayoutAssignment || FleetSeatLayoutAssignmentModel;
  const SeatLayoutRevision = deps.SeatLayoutRevision || SeatLayoutRevisionModel;

  const report = {
    summary: {
      totalApprovedOwners: 0,
      totalFleets: 0,
      schemaBlockersCount: 0,
      submissionBlockersCount: 0,
      operationalBlockersCount: 0,
      approvedOwnersWithoutBrands: 0,
      ownersWithMultipleDefaultBrands: 0,
      fleetsWithNoBrand: 0,
      fleetsReferencingMissingBrands: 0,
      fleetsReferencingForeignBrand: 0,
      inactiveBrandsUsedByFleets: 0,
      fleetsWithoutSeatLayoutAssignment: 0,
      unpublishedAssignedRevisions: 0,
      seatCountMismatches: 0,
      hasBlockingConflicts: false,
    },
    blockers: {
      schema: { count: 0, items: {} },
      submission: { count: 0, items: {} },
      operational: { count: 0, items: {} },
    },
    details: {
      approvedOwnersWithoutBrands: [],
      ownersWithMultipleDefaultBrands: [],
      fleetsWithNoBrand: [],
      fleetsReferencingMissingBrands: [],
      fleetsReferencingForeignBrand: [],
      inactiveBrandsUsedByFleets: [],
      fleetsWithoutSeatLayoutAssignment: [],
      unpublishedAssignedRevisions: [],
      seatCountMismatches: [],
    },
  };

  // 1. Audit Approved Owners
  const approvedOwners = await BusOwner.find({ verificationStatus: "approved" })
    .select("_id user companyName busOwnerId")
    .lean();
  report.summary.totalApprovedOwners = approvedOwners.length;

  for (const owner of approvedOwners) {
    const brandCount = await OperatorBrand.countDocuments({ ownerId: owner.user });
    if (brandCount === 0) {
      report.details.approvedOwnersWithoutBrands.push({
        busOwnerId: owner.busOwnerId || String(owner._id),
        userId: String(owner.user),
        companyName: owner.companyName || null,
      });
    }
  }
  report.summary.approvedOwnersWithoutBrands = report.details.approvedOwnersWithoutBrands.length;

  // 2. Audit Owners with Multiple Default Brands
  const multipleDefaults = await OperatorBrand.aggregate([
    { $match: { isDefault: true } },
    { $group: { _id: "$ownerId", count: { $sum: 1 }, brandIds: { $push: "$_id" } } },
    { $match: { count: { $gt: 1 } } },
  ]);

  for (const item of multipleDefaults) {
    report.details.ownersWithMultipleDefaultBrands.push({
      ownerId: String(item._id),
      defaultBrandCount: item.count,
      brandIds: item.brandIds.map(String),
    });
  }
  report.summary.ownersWithMultipleDefaultBrands = report.details.ownersWithMultipleDefaultBrands.length;

  // 3. Audit Fleets
  const fleets = await Bus.find({})
    .select("_id fleetId busNumber ownerId brandId totalSeats approvalStatus")
    .lean();
  report.summary.totalFleets = fleets.length;

  for (const fleet of fleets) {
    const fleetRef = {
      _id: String(fleet._id),
      fleetId: fleet.fleetId || String(fleet._id),
      busNumber: fleet.busNumber,
      ownerId: String(fleet.ownerId),
    };

    // Brand checks
    if (!fleet.brandId) {
      report.details.fleetsWithNoBrand.push(fleetRef);
    } else {
      const brand = await OperatorBrand.findById(fleet.brandId)
        .select("_id ownerId status brandName")
        .lean();
      if (!brand) {
        report.details.fleetsReferencingMissingBrands.push({
          ...fleetRef,
          brandId: String(fleet.brandId),
        });
      } else {
        if (String(brand.ownerId) !== String(fleet.ownerId)) {
          report.details.fleetsReferencingForeignBrand.push({
            ...fleetRef,
            brandId: String(fleet.brandId),
            brandOwnerId: String(brand.ownerId),
          });
        }
        if (brand.status !== "ACTIVE") {
          report.details.inactiveBrandsUsedByFleets.push({
            ...fleetRef,
            brandId: String(fleet.brandId),
            brandStatus: brand.status,
          });
        }
      }
    }

    // Seat layout checks
    const assignment = await FleetSeatLayoutAssignment.findOne({ fleetId: fleet._id })
      .select("activeRevisionId")
      .lean();

    if (!assignment) {
      report.details.fleetsWithoutSeatLayoutAssignment.push(fleetRef);
    } else {
      const revision = await SeatLayoutRevision.findById(assignment.activeRevisionId)
        .select("status totalPlaces")
        .lean();

      if (!revision || revision.status !== "PUBLISHED") {
        report.details.unpublishedAssignedRevisions.push({
          ...fleetRef,
          revisionId: String(assignment.activeRevisionId),
          revisionStatus: revision?.status || "MISSING",
        });
      } else if (Number(revision.totalPlaces) !== Number(fleet.totalSeats)) {
        report.details.seatCountMismatches.push({
          ...fleetRef,
          fleetTotalSeats: fleet.totalSeats,
          revisionTotalPlaces: revision.totalPlaces,
        });
      }
    }
  }

  report.summary.fleetsWithNoBrand = report.details.fleetsWithNoBrand.length;
  report.summary.fleetsReferencingMissingBrands = report.details.fleetsReferencingMissingBrands.length;
  report.summary.fleetsReferencingForeignBrand = report.details.fleetsReferencingForeignBrand.length;
  report.summary.inactiveBrandsUsedByFleets = report.details.inactiveBrandsUsedByFleets.length;
  report.summary.fleetsWithoutSeatLayoutAssignment = report.details.fleetsWithoutSeatLayoutAssignment.length;
  report.summary.unpublishedAssignedRevisions = report.details.unpublishedAssignedRevisions.length;
  report.summary.seatCountMismatches = report.details.seatCountMismatches.length;

  const schemaBlockersCount =
    report.details.ownersWithMultipleDefaultBrands.length +
    report.details.fleetsReferencingMissingBrands.length +
    report.details.fleetsReferencingForeignBrand.length;

  const submissionBlockersCount =
    report.details.approvedOwnersWithoutBrands.length +
    report.details.fleetsWithNoBrand.length +
    report.details.inactiveBrandsUsedByFleets.length +
    report.details.unpublishedAssignedRevisions.length +
    report.details.seatCountMismatches.length;

  const operationalBlockersCount =
    report.details.fleetsWithoutSeatLayoutAssignment.length;

  report.summary.schemaBlockersCount = schemaBlockersCount;
  report.summary.submissionBlockersCount = submissionBlockersCount;
  report.summary.operationalBlockersCount = operationalBlockersCount;
  report.summary.hasBlockingConflicts = Boolean(
    schemaBlockersCount > 0 || submissionBlockersCount > 0 || operationalBlockersCount > 0
  );

  report.blockers = {
    schema: {
      count: schemaBlockersCount,
      ownersWithMultipleDefaultBrands: report.details.ownersWithMultipleDefaultBrands,
      fleetsReferencingMissingBrands: report.details.fleetsReferencingMissingBrands,
      fleetsReferencingForeignBrand: report.details.fleetsReferencingForeignBrand,
    },
    submission: {
      count: submissionBlockersCount,
      approvedOwnersWithoutBrands: report.details.approvedOwnersWithoutBrands,
      fleetsWithNoBrand: report.details.fleetsWithNoBrand,
      inactiveBrandsUsedByFleets: report.details.inactiveBrandsUsedByFleets,
      unpublishedAssignedRevisions: report.details.unpublishedAssignedRevisions,
      seatCountMismatches: report.details.seatCountMismatches,
    },
    operational: {
      count: operationalBlockersCount,
      fleetsWithoutSeatLayoutAssignment: report.details.fleetsWithoutSeatLayoutAssignment,
    },
  };

  return report;
}

module.exports = { runBrandFleetPreflightAudit };
