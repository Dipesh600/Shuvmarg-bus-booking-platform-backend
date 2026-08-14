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

test("4. Pending owner cannot submit a DRAFT fleet for verification", async () => {
  const mockBusModel = {
    findOne: () => ({ lean: async () => createMockFleet({ approvalStatus: "DRAFT" }) }),
  };
  const submissionService = createFleetSubmissionService({
    BusOwner: mockBusOwnerModel("pending", "owner_pending"),
    Bus: mockBusModel,
    loadSeatLayout: async () => ({ assigned: true, published: true, totalPlaces: 35 }),
  });

  await assert.rejects(
    submissionService.submitFleetForVerification({ fleetId: "fleet_101", ownerId: "owner_pending" }),
    { code: "PROFILE_NOT_APPROVED", statusCode: 403 }
  );
});

test("5 & 6. Approved owner can submit complete owned DRAFT fleet (DRAFT -> PENDING transition)", async () => {
  let submittedUpdate = null;
  const mockBusModel = {
    findOne: () => ({ lean: async () => createMockFleet({ approvalStatus: "DRAFT" }) }),
    findOneAndUpdate: (query, update) => {
      submittedUpdate = update.$set;
      return { lean: async () => createMockFleet({ approvalStatus: "PENDING" }) };
    },
  };
  const submissionService = createFleetSubmissionService({
    BusOwner: mockBusOwnerModel("approved", "owner_123"),
    Bus: mockBusModel,
    loadSeatLayout: async () => ({ assigned: true, published: true, totalPlaces: 35 }),
  });

  const result = await submissionService.submitFleetForVerification({ fleetId: "fleet_101", ownerId: "owner_123" });
  assert.equal(submittedUpdate.approvalStatus, "PENDING");
  assert.equal(submittedUpdate.status, "INACTIVE");
  assert.equal(submittedUpdate.setupComplete, true);
  assert.equal(result.approvalStatus, "PENDING");
});

test("7 & 8. REJECTED fleet can be edited and resubmitted (REJECTED -> PENDING)", async () => {
  let submittedUpdate = null;
  const mockBusModel = {
    findOne: () => ({ lean: async () => createMockFleet({ approvalStatus: "REJECTED", rejectionReason: "Bad photo" }) }),
    findOneAndUpdate: (query, update) => {
      submittedUpdate = update.$set;
      return { lean: async () => createMockFleet({ approvalStatus: "PENDING" }) };
    },
  };
  const submissionService = createFleetSubmissionService({
    BusOwner: mockBusOwnerModel("approved", "owner_123"),
    Bus: mockBusModel,
    loadSeatLayout: async () => ({ assigned: true, published: true, totalPlaces: 35 }),
  });

  const result = await submissionService.submitFleetForVerification({ fleetId: "fleet_101", ownerId: "owner_123" });
  assert.equal(submittedUpdate.approvalStatus, "PENDING");
  assert.equal(submittedUpdate.rejectionReason, null);
  assert.equal(result.approvalStatus, "PENDING");
});

test("22. Unapproved owner cannot bypass submission by calling domain service without route middleware", async () => {
  const mockBusModel = {
    findOne: () => ({ lean: async () => createMockFleet({ approvalStatus: "DRAFT" }) }),
  };
  const submissionService = createFleetSubmissionService({
    BusOwner: mockBusOwnerModel("rejected", "owner_rej"),
    Bus: mockBusModel,
    loadSeatLayout: async () => ({ assigned: true, published: true, totalPlaces: 35 }),
  });

  await assert.rejects(
    submissionService.submitFleetForVerification({ fleetId: "fleet_101", ownerId: "owner_rej" }),
    { code: "PROFILE_NOT_APPROVED", statusCode: 403 }
  );
});
