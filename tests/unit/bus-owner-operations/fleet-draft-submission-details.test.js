"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createFleetSubmissionService } = require("../../../src/modules/fleet-management/fleet-submission.service");

function mockBusOwner(verificationStatus = "approved", user = "owner_123") {
  return { _id: "bo_123", user, verificationStatus };
}

function mockBusOwnerModel(verificationStatus = "approved", user = "owner_123") {
  return {
    findOne: () => ({
      select: () => ({
        lean: async () => mockBusOwner(verificationStatus, user),
      }),
    }),
  };
}

function createMockFleet(overrides = {}) {
  return {
    _id: "507f1f77bcf86cd799439011",
    ownerId: "owner_123",
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
    fleetImages: ["FRONT", "SIDE", "BACK", "INSIDE"].map((view) => ({ imageId: view, view, objectKey: `keys/${view}.webp`, uploadedAt: new Date() })),
    ...overrides,
  };
}

test("25. Submission transition is safe under concurrent submit attempts", async () => {
  let attempts = 0;
  const mockBusModel = {
    findOne: () => ({ lean: async () => createMockFleet({ approvalStatus: "DRAFT" }) }),
    findOneAndUpdate: () => {
      attempts++;
      if (attempts === 1) {
        return { lean: async () => createMockFleet({ approvalStatus: "PENDING" }) };
      }
      return { lean: async () => null };
    },
  };
  const submissionService = createFleetSubmissionService({
    BusOwner: mockBusOwnerModel("approved", "owner_123"),
    Bus: mockBusModel,
    loadSeatLayout: async () => ({ assigned: true, published: true, totalPlaces: 35 }),
  });

  const req1 = submissionService.submitFleetForVerification({ fleetId: "fleet_101", ownerId: "owner_123" });
  const req2 = submissionService.submitFleetForVerification({ fleetId: "fleet_101", ownerId: "owner_123" });

  const results = await Promise.allSettled([req1, req2]);
  const fulfilled = results.filter((r) => r.status === "fulfilled");
  const rejected = results.filter((r) => r.status === "rejected");

  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].reason.code, "FLEET_SUBMISSION_LOCKED");
});

test("28. Submission appends an approvalAuditHistory lifecycle entry", async () => {
  let pushedAudit = null;
  const mockBusModel = {
    findOne: () => ({ lean: async () => createMockFleet({ approvalStatus: "DRAFT" }) }),
    findOneAndUpdate: (query, update) => {
      pushedAudit = update.$push.approvalAuditHistory;
      return { lean: async () => createMockFleet({ approvalStatus: "PENDING" }) };
    },
  };
  const submissionService = createFleetSubmissionService({
    BusOwner: mockBusOwnerModel("approved", "owner_123"),
    Bus: mockBusModel,
    loadSeatLayout: async () => ({ assigned: true, published: true, totalPlaces: 35 }),
  });

  await submissionService.submitFleetForVerification({ fleetId: "fleet_101", ownerId: "owner_123" });
  assert.equal(pushedAudit.eventType, "FLEET_SUBMITTED");
  assert.equal(pushedAudit.fromStatus, "DRAFT");
  assert.equal(pushedAudit.toStatus, "PENDING");
});

test("rejected fleet resubmission appends an owner-only resubmission lifecycle entry", async () => {
  let pushedAudit = null;
  const mockBusModel = {
    findOne: () => ({ lean: async () => createMockFleet({ approvalStatus: "REJECTED" }) }),
    findOneAndUpdate: (_query, update) => {
      pushedAudit = update.$push.approvalAuditHistory;
      return { lean: async () => createMockFleet({ approvalStatus: "PENDING" }) };
    },
  };
  const submissionService = createFleetSubmissionService({
    BusOwner: mockBusOwnerModel("approved", "owner_123"),
    Bus: mockBusModel,
    loadSeatLayout: async () => ({ assigned: true, published: true, totalPlaces: 35 }),
  });

  await submissionService.submitFleetForVerification({ fleetId: "fleet_101", ownerId: "owner_123" });
  assert.equal(pushedAudit.eventType, "FLEET_RESUBMITTED");
  assert.equal(pushedAudit.actorType, "BUS_OWNER");
  assert.equal(pushedAudit.fromStatus, "REJECTED");
  assert.equal(pushedAudit.toStatus, "PENDING");
});

test("33. Successful submission increments __v version count", async () => {
  let incUpdate = null;
  const mockBusModel = {
    findOne: () => ({ lean: async () => createMockFleet({ approvalStatus: "DRAFT" }) }),
    findOneAndUpdate: (query, update) => {
      incUpdate = update.$inc;
      return { lean: async () => createMockFleet({ approvalStatus: "PENDING", __v: 1 }) };
    },
  };
  const submissionService = createFleetSubmissionService({
    BusOwner: mockBusOwnerModel("approved", "owner_123"),
    Bus: mockBusModel,
    loadSeatLayout: async () => ({ assigned: true, published: true, totalPlaces: 35 }),
  });

  await submissionService.submitFleetForVerification({ fleetId: "fleet_101", ownerId: "owner_123" });
  assert.deepEqual(incUpdate, { __v: 1 });
});
