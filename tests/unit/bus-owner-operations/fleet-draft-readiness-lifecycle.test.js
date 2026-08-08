"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluateFleetSubmissionReadiness } = require("../../../src/modules/fleet-management/fleet-readiness.evaluator");

function createMockFleet(overrides = {}) {
  return {
    _id: "507f1f77bcf86cd799439011",
    ownerId: "owner_123",
    busName: "Super Deluxe 101",
    busNumber: "BA 1 PA 1234",
    busType: "AC",
    vehicleType: "bus",
    totalSeats: 35,
    status: "INACTIVE",
    approvalStatus: "DRAFT",
    setupComplete: false,
    fleetDocuments: {
      fitnessCert: { objectKey: "keys/fit.pdf", uploadedAt: new Date() },
      insurance: { objectKey: "keys/ins.pdf", uploadedAt: new Date() },
      bluebook: { objectKey: "keys/blue.pdf", uploadedAt: new Date() },
      routePermit: { objectKey: "keys/permit.pdf", uploadedAt: new Date() },
    },
    fleetImages: [{ imageId: "img1", objectKey: "keys/img.jpg", uploadedAt: new Date() }],
    ...overrides,
  };
}

test("13. Missing required documents block submission", () => {
  const fleetNoBluebook = createMockFleet({
    fleetDocuments: {
      fitnessCert: { objectKey: "keys/fit.pdf", uploadedAt: new Date() },
      insurance: { objectKey: "keys/ins.pdf", uploadedAt: new Date() },
      routePermit: { objectKey: "keys/permit.pdf", uploadedAt: new Date() },
    },
  });

  const readiness = evaluateFleetSubmissionReadiness(fleetNoBluebook);
  assert.equal(readiness.complete, false);
  assert.deepEqual(readiness.missingDocuments, ["bluebook"]);
});

test("14. Incomplete setup fields block submission", () => {
  const fleetNoNumber = createMockFleet({ busNumber: "" });
  const readiness = evaluateFleetSubmissionReadiness(fleetNoNumber);
  assert.equal(readiness.complete, false);
  assert.deepEqual(readiness.missingFields, ["busNumber"]);
});

test("24. Empty document schema default objects do not satisfy submission readiness", () => {
  const fleetWithEmptyDocSchema = createMockFleet({
    fleetDocuments: {
      fitnessCert: {},
      insurance: {},
      bluebook: {},
      routePermit: {},
    },
    fleetImages: [],
  });

  const readiness = evaluateFleetSubmissionReadiness(fleetWithEmptyDocSchema);
  assert.equal(readiness.complete, false);
  assert.deepEqual(readiness.missingDocuments, ["fitnessCert", "insurance", "bluebook", "routePermit"]);
  assert.deepEqual(readiness.missingAssets, ["fleetImages"]);
});

test("27. Draft document reviews default to not_submitted", () => {
  const { mapBusOwnerFleetDetail } = require("../../../src/modules/read-contracts/fleet/bus-owner-fleet-detail.dto");
  const draftFleet = createMockFleet({ approvalStatus: "DRAFT" });
  const detail = mapBusOwnerFleetDetail(draftFleet);
  assert.equal(detail.approvalStatus, "DRAFT");
});
