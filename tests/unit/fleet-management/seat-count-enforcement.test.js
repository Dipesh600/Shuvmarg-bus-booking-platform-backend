"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluateFleetSubmissionReadiness } = require("../../../src/modules/fleet-management/fleet-readiness.evaluator");

function createMockFleet(overrides = {}) {
  return {
    _id: "507f1f77bcf86cd799439011",
    ownerId: "507f1f77bcf86cd799439012",
    busName: "Super Deluxe 101",
    busNumber: "BA 1 PA 1234",
    busType: "AC",
    vehicleType: "bus",
    totalSeats: 35,
    registrationYear: 2024,
    status: "INACTIVE",
    approvalStatus: "DRAFT",
    setupComplete: false,
    fleetDocuments: {
      fitnessCert: { objectKey: "keys/fit.pdf", uploadedAt: new Date() },
      insurance: { objectKey: "keys/ins.pdf", uploadedAt: new Date() },
      bluebook: { objectKey: "keys/blue.pdf", uploadedAt: new Date() },
      routePermit: { objectKey: "keys/permit.pdf", uploadedAt: new Date() },
    },
    fleetImages: ["FRONT", "SIDE", "BACK", "INSIDE"].map((view) => ({
      imageId: view,
      view,
      objectKey: `keys/${view}.webp`,
      uploadedAt: new Date(),
    })),
    ...overrides,
  };
}

test("seat-count-enforcement: matching count accepted when published", () => {
  const fleet = createMockFleet({ totalSeats: 36 });
  const readiness = evaluateFleetSubmissionReadiness(fleet, {
    seatLayout: {
      assigned: true,
      published: true,
      totalPlaces: 36,
    },
  });

  assert.equal(readiness.complete, true);
  assert.deepEqual(readiness.missingConfiguration, []);
  assert.deepEqual(readiness.configurationErrors, []);
});

test("seat-count-enforcement: smaller submitted count rejected", () => {
  const fleet = createMockFleet({ totalSeats: 30 });
  const readiness = evaluateFleetSubmissionReadiness(fleet, {
    seatLayout: {
      assigned: true,
      published: true,
      totalPlaces: 35,
    },
  });

  assert.equal(readiness.complete, false);
  assert.deepEqual(readiness.configurationErrors, ["seatCountMismatch"]);
});

test("seat-count-enforcement: larger submitted count rejected", () => {
  const fleet = createMockFleet({ totalSeats: 40 });
  const readiness = evaluateFleetSubmissionReadiness(fleet, {
    seatLayout: {
      assigned: true,
      published: true,
      totalPlaces: 35,
    },
  });

  assert.equal(readiness.complete, false);
  assert.deepEqual(readiness.configurationErrors, ["seatCountMismatch"]);
});

test("seat-count-enforcement: missing assignment rejected", () => {
  const fleet = createMockFleet({ totalSeats: 35 });
  const readiness = evaluateFleetSubmissionReadiness(fleet, {
    seatLayout: {
      assigned: false,
    },
  });

  assert.equal(readiness.complete, false);
  assert.deepEqual(readiness.missingConfiguration, ["seatLayout"]);
});

test("seat-count-enforcement: draft (unpublished) revision rejected", () => {
  const fleet = createMockFleet({ totalSeats: 35 });
  const readiness = evaluateFleetSubmissionReadiness(fleet, {
    seatLayout: {
      assigned: true,
      published: false,
      totalPlaces: 35,
    },
  });

  assert.equal(readiness.complete, false);
  assert.deepEqual(readiness.configurationErrors, ["seatLayoutNotPublished"]);
});
