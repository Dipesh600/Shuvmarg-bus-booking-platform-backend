"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createFleetSubmissionService } = require("../../../src/modules/fleet-management/fleet-submission.service");
const { createFleetUpdateService } = require("../../../src/modules/fleet-management/fleet-update.service");
const { createFleetQueryService } = require("../../../src/modules/fleet-management/fleet-query.service");

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

test("15. Ownership isolation: Bus owner A cannot read, edit, delete, or submit Bus owner B's fleet ID", async () => {
  const fleetOwnerA = createMockFleet({ ownerId: "owner_A" });
  const repo = {
    findDocument: async (id, ownerId) => (ownerId === fleetOwnerA.ownerId ? fleetOwnerA : null),
    remove: async () => {},
  };
  const mockBusModel = {
    findOne: (query) => {
      const match = query.ownerId === fleetOwnerA.ownerId ? fleetOwnerA : null;
      return { lean: async () => match };
    },
  };
  const updateService = createFleetUpdateService({ Bus: mockBusModel, repository: repo, policy: {}, storage: {}, mapper: {} });
  const queryService = createFleetQueryService({ repository: repo, mapper: {} });
  const submissionService = createFleetSubmissionService({
    BusOwner: mockBusOwnerModel("approved", "owner_B"),
    Bus: mockBusModel,
    loadSeatLayout: async () => ({ assigned: true, published: true, totalPlaces: 35 }),
  });

  await assert.rejects(
    updateService.updateFleetDetails(fleetOwnerA._id, { busName: "Hacked" }, {}, "owner_B"),
    { code: "FLEET_NOT_FOUND", statusCode: 404 }
  );

  await assert.rejects(
    queryService.removeFleet(fleetOwnerA._id, "owner_B"),
    { code: "FLEET_NOT_FOUND", statusCode: 404 }
  );

  await assert.rejects(
    submissionService.submitFleetForVerification({ fleetId: fleetOwnerA._id, ownerId: "owner_B" }),
    { code: "FLEET_NOT_FOUND", statusCode: 404 }
  );
});

test("34. Correcting a rejected document records REJECTED -> REJECTED in audit event", async () => {
  const createFleetDocumentUploadService = require("../../../src/modules/fleet/document-lifecycle/fleet-document-upload.service");
  let capturedAuditEvent = null;
  const validId = "507f1f77bcf86cd799439011";
  const rejectedFleet = createMockFleet({
    _id: validId,
    approvalStatus: "REJECTED",
    documentReviews: { insurance: { status: "rejected", reason: "Expired document" } },
    __v: 1,
  });
  const mockRepository = {
    findFleetForDocumentUpdate: async () => rejectedFleet,
    atomicDocumentUpdate: async ({ update }) => {
      capturedAuditEvent = update.$push.fleetDocumentAuditHistory;
      return { ...rejectedFleet, ...update.$set };
    },
  };
  const mockStorage = {
    buildPrivateObjectKey: () => "keys/resub.pdf",
    uploadPrivate: async () => "keys/resub.pdf",
    deleteNewObjectOrReport: async () => {},
    deleteOldObjectBestEffort: async () => {},
  };

  const service = createFleetDocumentUploadService({
    repository: mockRepository,
    storage: mockStorage,
    resolveActor: async () => ({ actorType: "BUS_OWNER", userId: "owner_123" }),
  });

  const file = { data: Buffer.from("%PDF-1.4 test header content"), name: "doc.pdf", mimetype: "application/pdf", size: 500 };
  await service.uploadDocument({
    fleetId: validId,
    slot: "insurance",
    body: { changeReason: "Resubmitting valid policy document", policyNumber: "POL-999", validTill: "2028-12-31" },
    files: { insurance: file },
    actorContext: { id: "owner_123" },
  });

  assert.equal(capturedAuditEvent.previousFleetApprovalStatus, "REJECTED");
  assert.equal(capturedAuditEvent.resultingFleetApprovalStatus, "REJECTED");
});
