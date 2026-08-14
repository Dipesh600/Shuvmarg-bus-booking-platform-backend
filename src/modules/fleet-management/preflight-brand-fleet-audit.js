"use strict";

const BusModel = require("../../../models/fleetModel");
const BusOwnerModel = require("../../../models/busOwnerModel");
const OperatorBrandModel = require("../../../models/operatorBrandModel");
const FleetSeatLayoutAssignmentModel = require("../../../models/fleetSeatLayoutAssignmentModel");
const SeatLayoutRevisionModel = require("../../../models/seatLayoutRevisionModel");
const { createBrandFleetAuditReport, finalizeBrandFleetAuditReport } = require("./preflight-brand-fleet-report");

function fleetReference(fleet) {
  return { _id: String(fleet._id), fleetId: fleet.fleetId || String(fleet._id), busNumber: fleet.busNumber, ownerId: String(fleet.ownerId) };
}

async function auditFleets({ Bus, OperatorBrand, FleetSeatLayoutAssignment, SeatLayoutRevision, report }) {
  const fleets = await Bus.find({}).select("_id fleetId busNumber ownerId brandId totalSeats approvalStatus").lean();
  report.summary.totalFleets = fleets.length;
  for (const fleet of fleets) {
    const reference = fleetReference(fleet);
    if (!fleet.brandId) report.details.fleetsWithNoBrand.push(reference);
    else {
      const brand = await OperatorBrand.findById(fleet.brandId).select("_id ownerId status brandName").lean();
      if (!brand) report.details.fleetsReferencingMissingBrands.push({ ...reference, brandId: String(fleet.brandId) });
      else {
        if (String(brand.ownerId) !== String(fleet.ownerId)) report.details.fleetsReferencingForeignBrand.push({ ...reference, brandId: String(fleet.brandId), brandOwnerId: String(brand.ownerId) });
        if (brand.status !== "ACTIVE") report.details.inactiveBrandsUsedByFleets.push({ ...reference, brandId: String(fleet.brandId), brandStatus: brand.status });
      }
    }
    const assignment = await FleetSeatLayoutAssignment.findOne({ fleetId: fleet._id }).select("activeRevisionId").lean();
    if (!assignment) { report.details.fleetsWithoutSeatLayoutAssignment.push(reference); continue; }
    const revision = await SeatLayoutRevision.findById(assignment.activeRevisionId).select("status totalPlaces").lean();
    if (!revision || revision.status !== "PUBLISHED") report.details.unpublishedAssignedRevisions.push({ ...reference, revisionId: String(assignment.activeRevisionId), revisionStatus: revision?.status || "MISSING" });
    else if (Number(revision.totalPlaces) !== Number(fleet.totalSeats)) report.details.seatCountMismatches.push({ ...reference, fleetTotalSeats: fleet.totalSeats, revisionTotalPlaces: revision.totalPlaces });
  }
}

async function runBrandFleetPreflightAudit(deps = {}) {
  const Bus = deps.Bus || BusModel; const BusOwner = deps.BusOwner || BusOwnerModel; const OperatorBrand = deps.OperatorBrand || OperatorBrandModel;
  const FleetSeatLayoutAssignment = deps.FleetSeatLayoutAssignment || FleetSeatLayoutAssignmentModel; const SeatLayoutRevision = deps.SeatLayoutRevision || SeatLayoutRevisionModel;
  const report = createBrandFleetAuditReport();
  const owners = await BusOwner.find({ verificationStatus: "approved" }).select("_id user companyName busOwnerId").lean();
  report.summary.totalApprovedOwners = owners.length;
  for (const owner of owners) {
    if (await OperatorBrand.countDocuments({ ownerId: owner.user }) === 0) report.details.approvedOwnersWithoutBrands.push({ busOwnerId: owner.busOwnerId || String(owner._id), userId: String(owner.user), companyName: owner.companyName || null });
  }
  const defaults = await OperatorBrand.aggregate([{ $match: { isDefault: true } }, { $group: { _id: "$ownerId", count: { $sum: 1 }, brandIds: { $push: "$_id" } } }, { $match: { count: { $gt: 1 } } }]);
  for (const item of defaults) report.details.ownersWithMultipleDefaultBrands.push({ ownerId: String(item._id), defaultBrandCount: item.count, brandIds: item.brandIds.map(String) });
  await auditFleets({ Bus, OperatorBrand, FleetSeatLayoutAssignment, SeatLayoutRevision, report });
  return finalizeBrandFleetAuditReport(report);
}

module.exports = { runBrandFleetPreflightAudit };
