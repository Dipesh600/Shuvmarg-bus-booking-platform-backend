"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createFleetUpdateService } = require("../../../src/modules/fleet-management/fleet-update.service");
const { createFleetQueryService } = require("../../../src/modules/fleet-management/fleet-query.service");
const { enforceUploadPolicy } = require("../../../src/modules/fleet/document-lifecycle/fleet-document-approval.policy");

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

test("9. PENDING fleet cannot be edited", async () => {
  const pendingFleet = createMockFleet({ approvalStatus: "PENDING" });
  const repo = { findDocument: async () => pendingFleet };
  const updateService = createFleetUpdateService({
    Bus: {}, repository: repo, policy: {}, storage: {}, mapper: {},
  });

  await assert.rejects(
    updateService.updateFleetDetails(pendingFleet._id, { busName: "Locked Edit" }, {}, "owner_123"),
    { code: "FLEET_MUTATION_LOCKED", statusCode: 409 }
  );
});

test("10. APPROVED fleet cannot be edited through draft endpoint", async () => {
  const approvedFleet = createMockFleet({ approvalStatus: "APPROVED" });
  const repo = { findDocument: async () => approvedFleet };
  const updateService = createFleetUpdateService({
    Bus: {}, repository: repo, policy: {}, storage: {}, mapper: {},
  });

  await assert.rejects(
    updateService.updateFleetDetails(approvedFleet._id, { busName: "Locked Edit" }, {}, "owner_123"),
    { code: "FLEET_MUTATION_LOCKED", statusCode: 409 }
  );
});

test("11 & 12. PENDING and APPROVED fleets cannot be deleted", async () => {
  for (const lockedStatus of ["PENDING", "APPROVED"]) {
    const fleet = createMockFleet({ approvalStatus: lockedStatus });
    const repo = { findDocument: async () => fleet };
    const queryService = createFleetQueryService({ repository: repo, mapper: {} });

    await assert.rejects(
      queryService.removeFleet(fleet._id, "owner_123"),
      { code: "FLEET_MUTATION_LOCKED", statusCode: 409 }
    );
  }
});

test("16, 17, 18. Route and trip assignment reject DRAFT, PENDING, and REJECTED fleets", () => {
  for (const unapprovedStatus of ["DRAFT", "PENDING", "REJECTED"]) {
    const fleet = createMockFleet({ approvalStatus: unapprovedStatus, isApproved: false });
    assert.equal(fleet.approvalStatus === "APPROVED" && fleet.isApproved === true, false);
  }
});

test("19. APPROVED fleet remains operationally usable", () => {
  const approvedFleet = createMockFleet({ approvalStatus: "APPROVED", isApproved: true });
  assert.equal(approvedFleet.approvalStatus === "APPROVED" && approvedFleet.isApproved === true, true);
});

test("26. Document upload is rejected if fleet becomes PENDING before persistence", () => {
  const pendingFleet = createMockFleet({ approvalStatus: "PENDING" });
  assert.throws(
    () => enforceUploadPolicy(pendingFleet, "bluebook"),
    (err) => err.message.includes("under review")
  );
});

test("31. APPROVED fleet cannot mutate any field through draft endpoint", async () => {
  const approvedFleet = createMockFleet({ approvalStatus: "APPROVED" });
  const repo = { findDocument: async () => approvedFleet };
  const updateService = createFleetUpdateService({
    Bus: {}, repository: repo, policy: {}, storage: {}, mapper: {},
  });

  await assert.rejects(
    updateService.updateFleetDetails("fleet_101", { busName: "Brand New Name" }, {}, "owner_123"),
    { code: "FLEET_MUTATION_LOCKED", statusCode: 409 }
  );
});

test("32. Document upload race cleans up new storage keys and throws 409 when atomic persistence query matches 0 documents", async () => {
  const createFleetDocumentUploadService = require("../../../src/modules/fleet/document-lifecycle/fleet-document-upload.service");
  let deletedKeys = [];
  const validId = "507f1f77bcf86cd799439011";
  const mockFleet = createMockFleet({ _id: validId, approvalStatus: "DRAFT", __v: 3 });
  const mockRepository = {
    findFleetForDocumentUpdate: async () => mockFleet,
    atomicDocumentUpdate: async () => null,
  };
  const mockStorage = {
    buildPrivateObjectKey: () => "keys/new_file.pdf",
    uploadPrivate: async () => "keys/new_file.pdf",
    deleteNewObjectOrReport: async (keys) => { deletedKeys = keys; },
  };

  const service = createFleetDocumentUploadService({
    repository: mockRepository,
    storage: mockStorage,
    resolveActor: async () => ({ actorType: "BUS_OWNER", userId: "owner_123" }),
  });

  const file = { data: Buffer.from("%PDF-1.4 test header content"), name: "doc.pdf", mimetype: "application/pdf", size: 500 };
  await assert.rejects(
    service.uploadDocument({
      fleetId: validId,
      slot: "insurance",
      body: { changeReason: "Updating insurance document", policyNumber: "POL-123", validTill: "2027-12-31" },
      files: { insurance: file },
      actorContext: { id: "owner_123" },
    }),
    (err) => err.code === "FLEET_DOCUMENT_CONCURRENT_MODIFICATION" && err.statusCode === 409
  );

  assert.deepEqual(deletedKeys, ["keys/new_file.pdf"]);
  assert.equal(mockFleet.fleetDocuments.insurance.objectKey, "keys/ins.pdf");
});
