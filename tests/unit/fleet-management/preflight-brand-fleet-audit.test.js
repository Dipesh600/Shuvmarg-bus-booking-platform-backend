"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { runBrandFleetPreflightAudit } = require("../../../src/modules/fleet-management/preflight-brand-fleet-audit");

test("preflight audit: categorizes schema, submission, and operational blockers", async () => {
  const mockBusOwner = {
    find: () => ({
      select: () => ({
        async lean() {
          return [
            { _id: "bo_1", user: "user_1", companyName: "Co 1" },
            { _id: "bo_2", user: "user_2", companyName: "Co 2" },
          ];
        },
      }),
    }),
  };

  const brands = [
    { _id: "brand_1", ownerId: "user_1", status: "ACTIVE", brandName: "Brand 1", isDefault: true },
  ];

  const mockOperatorBrand = {
    countDocuments: async (q) => brands.filter((b) => b.ownerId === q.ownerId).length,
    aggregate: async () => [],
    findById: (id) => ({
      select: () => ({
        async lean() {
          return brands.find((b) => b._id === id) || null;
        },
      }),
    }),
  };

  const fleets = [
    { _id: "f_1", fleetId: "f_1", busNumber: "BA-1", ownerId: "user_1", brandId: "brand_1", totalSeats: 30 },
    { _id: "f_2", fleetId: "f_2", busNumber: "BA-2", ownerId: "user_2", brandId: null, totalSeats: 30 },
    { _id: "f_3", fleetId: "f_3", busNumber: "BA-3", ownerId: "user_2", brandId: "brand_1", totalSeats: 30 }, // foreign
  ];

  const mockBus = {
    find: () => ({
      select: () => ({
        async lean() {
          return fleets;
        },
      }),
    }),
  };

  const mockAssignment = {
    findOne: (q) => ({
      select: () => ({
        async lean() {
          return { activeRevisionId: "rev_1" };
        },
      }),
    }),
  };

  const mockRevision = {
    findById: () => ({
      select: () => ({
        async lean() {
          return { status: "PUBLISHED", totalPlaces: 30 };
        },
      }),
    }),
  };

  const report = await runBrandFleetPreflightAudit({
    Bus: mockBus,
    BusOwner: mockBusOwner,
    OperatorBrand: mockOperatorBrand,
    FleetSeatLayoutAssignment: mockAssignment,
    SeatLayoutRevision: mockRevision,
  });

  assert.equal(report.summary.totalApprovedOwners, 2);
  assert.equal(report.summary.approvedOwnersWithoutBrands, 1);
  assert.equal(report.summary.fleetsWithNoBrand, 1);
  assert.equal(report.summary.fleetsReferencingForeignBrand, 1);
  assert.equal(report.summary.schemaBlockersCount, 1); // foreign brand reference
  assert.equal(report.summary.submissionBlockersCount, 2); // approved owner without brand + fleet without brand
  assert.equal(report.summary.operationalBlockersCount, 0);
  assert.equal(report.summary.hasBlockingConflicts, true);
  assert.equal(report.blockers.schema.count, 1);
  assert.equal(report.blockers.submission.count, 2);
  assert.equal(report.blockers.operational.count, 0);
});
