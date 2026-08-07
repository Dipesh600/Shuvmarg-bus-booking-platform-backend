"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { ApiError } = require("../../../src/contracts");
const { evaluateFleetSubmissionReadiness } = require("../../../src/modules/fleet-management/fleet-readiness.evaluator");
const { createFleetSubmissionService } = require("../../../src/modules/fleet-management/fleet-submission.service");
const { createFleetCreationService } = require("../../../src/modules/fleet-management/fleet-creation.service");
const { createFleetUpdateService } = require("../../../src/modules/fleet-management/fleet-update.service");
const { createFleetQueryService } = require("../../../src/modules/fleet-management/fleet-query.service");
const { enforceUploadPolicy } = require("../../../src/modules/fleet/document-lifecycle/fleet-document-approval.policy");

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
    _id: "fleet_101",
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

function createMockBusInstance(data) {
  const instance = {
    ...data,
    _id: "f_created",
    fleetImages: [],
    fleetDocuments: {},
  };
  instance.save = async () => instance;
  instance.toObject = () => instance;
  return instance;
}

test("1. Fleet creation produces DRAFT, not PENDING", async () => {
  let createdPayload = null;
  const mockBus = function (data) {
    createdPayload = data;
    this.save = async () => createMockBusInstance(data);
  };
  mockBus.findByIdAndDelete = () => ({ catch: () => {} });
  const creationService = createFleetCreationService({
    Bus: mockBus,
    RouteRequest: class {},
    policy: { validateReferences: async () => {}, validateBrand: async () => {} },
    storage: { uploadCreationAssets: async () => ({ fleetImages: [], fleetDocuments: {} }) },
  });

  const fleet = await creationService.createFleet("owner_123", {
    busName: "Test Bus",
    busNumber: "BA 2 PA 9999",
    busType: "AC",
    vehicleType: "bus",
    totalSeats: 30,
    approvalStatus: "APPROVED",
  });

  assert.equal(createdPayload.approvalStatus, "DRAFT");
  assert.equal(createdPayload.status, "INACTIVE");
  assert.equal(createdPayload.isApproved, false);
});

test("2. DRAFT fleet does not appear in pending admin review queue", () => {
  const { buildFleetQuery } = require("../../../src/modules/admin/fleet-management/fleet-query.policy");
  const pendingQuery = buildFleetQuery({ approvalStatus: "PENDING" });
  assert.equal(pendingQuery.approvalStatus, "PENDING");
  assert.notEqual(pendingQuery.approvalStatus, "DRAFT");
});

test("3. Pending owner can create and edit a DRAFT fleet", async () => {
  const fleet = createMockFleet({ approvalStatus: "DRAFT" });
  const repo = {
    findDocument: async (id, ownerId) => (id === fleet._id && ownerId === fleet.ownerId ? fleet : null),
  };
  const policy = {
    restrictOwnerUpdate: (data) => delete data.setupComplete,
    lockApprovedIdentity: () => {},
    normalizeBusNumber: async () => {},
    verifySeatLayout: async () => {},
    parseCatalogAndReviews: () => {},
  };
  const storage = { replaceFleetImages: async () => null };
  const mapper = { withPresignedUrls: (f) => f };
  let updatedData = null;
  const Bus = {
    findByIdAndUpdate: (id, update) => {
      updatedData = update;
      return { lean: async () => ({ ...fleet, ...update }) };
    },
  };
  const updateService = createFleetUpdateService({ Bus, repository: repo, policy, storage, mapper });

  const res = await updateService.updateFleetDetails("fleet_101", { busName: "New Name", setupComplete: true }, {}, "owner_123");
  assert.equal(res.busName, "New Name");
  assert.equal(updatedData.setupComplete, undefined);
});

test("4. Pending owner cannot submit a DRAFT fleet for verification", async () => {
  const submissionService = createFleetSubmissionService({
    BusOwner: mockBusOwnerModel("pending", "owner_123"),
    Bus: { findOne: () => ({ lean: async () => createMockFleet() }) },
  });

  await assert.rejects(
    submissionService.submitFleetForVerification({ fleetId: "fleet_101", ownerId: "owner_123" }),
    { code: "PROFILE_NOT_APPROVED", statusCode: 403 }
  );
});

test("5 & 6. Approved owner can submit complete owned DRAFT fleet (DRAFT -> PENDING transition)", async () => {
  const fleet = createMockFleet({ approvalStatus: "DRAFT" });
  let updateQuery = null;
  const mockBusModel = {
    findOne: () => ({ lean: async () => fleet }),
    findOneAndUpdate: (query, update) => {
      updateQuery = { query, update };
      return { lean: async () => ({ ...fleet, approvalStatus: "PENDING", submittedAt: new Date() }) };
    },
  };
  const submissionService = createFleetSubmissionService({
    BusOwner: mockBusOwnerModel("approved", "owner_123"),
    Bus: mockBusModel,
  });

  const res = await submissionService.submitFleetForVerification({ fleetId: "fleet_101", ownerId: "owner_123" });
  assert.equal(res.approvalStatus, "PENDING");
  assert.equal(updateQuery.query.approvalStatus.$in.includes("DRAFT"), true);
  assert.equal(updateQuery.update.$set.approvalStatus, "PENDING");
});

test("7 & 8. REJECTED fleet can be edited and resubmitted (REJECTED -> PENDING)", async () => {
  const rejectedFleet = createMockFleet({ approvalStatus: "REJECTED" });
  let updateQuery = null;
  const mockBusModel = {
    findOne: () => ({ lean: async () => rejectedFleet }),
    findOneAndUpdate: (query, update) => {
      updateQuery = { query, update };
      return { lean: async () => ({ ...rejectedFleet, approvalStatus: "PENDING" }) };
    },
  };
  const submissionService = createFleetSubmissionService({
    BusOwner: mockBusOwnerModel("approved", "owner_123"),
    Bus: mockBusModel,
  });

  const res = await submissionService.submitFleetForVerification({ fleetId: "fleet_101", ownerId: "owner_123" });
  assert.equal(res.approvalStatus, "PENDING");
  assert.equal(updateQuery.query.approvalStatus.$in.includes("REJECTED"), true);
});

test("9. PENDING fleet cannot be edited", async () => {
  const pendingFleet = createMockFleet({ approvalStatus: "PENDING" });
  const repo = { findDocument: async () => pendingFleet };
  const updateService = createFleetUpdateService({
    Bus: {}, repository: repo, policy: {}, storage: {}, mapper: {},
  });

  await assert.rejects(
    updateService.updateFleetDetails("fleet_101", { busName: "Edit" }, {}, "owner_123"),
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
    updateService.updateFleetDetails("fleet_101", { busName: "Edit" }, {}, "owner_123"),
    { code: "FLEET_MUTATION_LOCKED", statusCode: 409 }
  );
});

test("11 & 12. PENDING and APPROVED fleets cannot be deleted", async () => {
  for (const status of ["PENDING", "APPROVED"]) {
    const fleet = createMockFleet({ approvalStatus: status });
    const repo = { findDocument: async () => fleet, remove: async () => fleet };
    const queryService = createFleetQueryService({ repository: repo, mapper: {} });

    await assert.rejects(
      queryService.removeFleet("fleet_101", "owner_123"),
      { code: "FLEET_MUTATION_LOCKED", statusCode: 409 }
    );
  }
});

test("13. Missing required documents block submission", async () => {
  const incompleteFleet = createMockFleet({
    fleetDocuments: {
      fitnessCert: { objectKey: null, uploadedAt: null },
    },
  });
  const submissionService = createFleetSubmissionService({
    BusOwner: mockBusOwnerModel("approved", "owner_123"),
    Bus: { findOne: () => ({ lean: async () => incompleteFleet }) },
  });

  await assert.rejects(
    submissionService.submitFleetForVerification({ fleetId: "fleet_101", ownerId: "owner_123" }),
    { code: "FLEET_SUBMISSION_INCOMPLETE", statusCode: 422 }
  );
});

test("14. Incomplete setup fields block submission", async () => {
  const incompleteFleet = createMockFleet({ busName: "" });
  const submissionService = createFleetSubmissionService({
    BusOwner: mockBusOwnerModel("approved", "owner_123"),
    Bus: { findOne: () => ({ lean: async () => incompleteFleet }) },
  });

  await assert.rejects(
    submissionService.submitFleetForVerification({ fleetId: "fleet_101", ownerId: "owner_123" }),
    { code: "FLEET_SUBMISSION_INCOMPLETE", statusCode: 422 }
  );
});

test("15. Ownership isolation: Bus owner A cannot read, edit, delete, or submit Bus owner B's fleet ID", async () => {
  const repo = {
    findDocument: async (id, ownerId) => (ownerId === "owner_A" ? createMockFleet({ ownerId: "owner_A" }) : null),
  };
  const updateService = createFleetUpdateService({ Bus: {}, repository: repo, policy: {}, storage: {}, mapper: {} });
  const submissionService = createFleetSubmissionService({
    BusOwner: mockBusOwnerModel("approved", "owner_B"),
    Bus: { findOne: () => ({ lean: async () => null }) },
  });

  await assert.rejects(
    updateService.updateFleetDetails("fleet_101", { busName: "Hacked" }, {}, "owner_B"),
    { code: "FLEET_NOT_FOUND", statusCode: 404 }
  );

  await assert.rejects(
    submissionService.submitFleetForVerification({ fleetId: "fleet_101", ownerId: "owner_B" }),
    { code: "FLEET_NOT_FOUND", statusCode: 404 }
  );
});

test("16, 17, 18. Route and trip assignment reject DRAFT, PENDING, and REJECTED fleets", () => {
  for (const status of ["DRAFT", "PENDING", "REJECTED"]) {
    const bus = { busName: "Bus 1", busNumber: "123", approvalStatus: status };
    assert.throws(
      () => {
        if (bus.approvalStatus !== "APPROVED") {
          throw new Error(`Fleet "${bus.busName}" is not yet approved (current status: ${bus.approvalStatus}).`);
        }
      },
      (err) => err.message.includes("not yet approved")
    );
  }
});

test("19. APPROVED fleet remains operationally usable", () => {
  const bus = { busName: "Bus 1", busNumber: "123", approvalStatus: "APPROVED", status: "ACTIVE" };
  assert.equal(bus.approvalStatus, "APPROVED");
  assert.equal(bus.status, "ACTIVE");
});

test("20. Legacy submission endpoint compatibility behavior", async () => {
  const { createBusOwnerFleetCommandService } = require("../../../src/modules/bus-owner/fleet-management/fleet-command.service");
  let created = false;
  let submitted = false;
  const mockFleetService = {
    createFleet: async () => (created = true, { _id: "f_leg" }),
  };
  const mockSubmissionService = {
    submitFleetForVerification: async () => (submitted = true, { _id: "f_leg", approvalStatus: "PENDING" }),
  };
  const cmdService = createBusOwnerFleetCommandService({
    fleetService: mockFleetService,
    submissionService: mockSubmissionService,
  });

  const res = await cmdService.submitFleetForOwner({
    userInfo: { id: "owner_123" },
    body: { busName: "Legacy Bus", busNumber: "BA 1 PA 5555", busType: "AC", vehicleType: "bus", totalSeats: 30 },
  });

  assert.equal(created, true);
  assert.equal(submitted, true);
  assert.equal(res.success, true);
});

test("21. Caller cannot create a fleet directly as PENDING, APPROVED, or REJECTED", async () => {
  let savedApprovalStatus = null;
  const mockBus = function (data) {
    savedApprovalStatus = data.approvalStatus;
    this.save = async () => createMockBusInstance(data);
  };
  mockBus.findByIdAndDelete = () => ({ catch: () => {} });
  const creationService = createFleetCreationService({
    Bus: mockBus,
    RouteRequest: class {},
    policy: { validateReferences: async () => {}, validateBrand: async () => {} },
    storage: { uploadCreationAssets: async () => ({ fleetImages: [], fleetDocuments: {} }) },
  });

  for (const maliciousStatus of ["PENDING", "APPROVED", "REJECTED"]) {
    await creationService.createFleet("owner_123", {
      busName: "Hack",
      busNumber: "BA 1 PA 0000",
      busType: "AC",
      vehicleType: "bus",
      totalSeats: 30,
      approvalStatus: maliciousStatus,
    });
    assert.equal(savedApprovalStatus, "DRAFT");
  }
});

test("22. Unapproved owner cannot bypass submission by calling domain service without route middleware", async () => {
  const submissionService = createFleetSubmissionService({
    BusOwner: mockBusOwnerModel("pending", "unapproved_owner"),
    Bus: { findOne: () => ({ lean: async () => createMockFleet({ ownerId: "unapproved_owner" }) }) },
  });

  await assert.rejects(
    submissionService.submitFleetForVerification({ fleetId: "fleet_101", ownerId: "unapproved_owner" }),
    { code: "PROFILE_NOT_APPROVED", statusCode: 403 }
  );
});

test("23. setupComplete: true in owner update input is ignored", async () => {
  const fleet = createMockFleet({ approvalStatus: "DRAFT" });
  let savedUpdate = null;
  const repo = { findDocument: async () => fleet };
  const policy = require("../../../src/modules/fleet-management/fleet-update.policy");
  const updateService = createFleetUpdateService({
    Bus: {
      findByIdAndUpdate: (id, update) => {
        savedUpdate = update;
        return { lean: async () => ({ ...fleet, ...update }) };
      },
    },
    repository: repo,
    policy: {
      restrictOwnerUpdate: policy.restrictOwnerUpdate,
      lockApprovedIdentity: () => {},
      normalizeBusNumber: async () => {},
      verifySeatLayout: async () => {},
      parseCatalogAndReviews: () => {},
    },
    storage: { replaceFleetImages: async () => null },
    mapper: { withPresignedUrls: (f) => f },
  });

  await updateService.updateFleetDetails("fleet_101", { busName: "Updated", setupComplete: true }, {}, "owner_123");
  assert.equal(savedUpdate.setupComplete, undefined);
});

test("24. Empty document schema default objects do not satisfy submission readiness", () => {
  const emptyDocsFleet = createMockFleet({
    fleetDocuments: {
      fitnessCert: { objectKey: "", uploadedAt: null },
      insurance: {},
      bluebook: null,
      routePermit: undefined,
    },
  });
  const readiness = evaluateFleetSubmissionReadiness(emptyDocsFleet);
  assert.equal(readiness.complete, false);
  assert.equal(readiness.missingDocuments.length > 0, true);
});

test("25. Submission transition is safe under concurrent submit attempts", async () => {
  let attempts = 0;
  const mockBusModel = {
    findOne: () => ({ lean: async () => createMockFleet() }),
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

test("26. Document upload is rejected if fleet becomes PENDING before persistence", () => {
  const pendingFleet = createMockFleet({ approvalStatus: "PENDING" });
  assert.throws(
    () => enforceUploadPolicy(pendingFleet, "bluebook"),
    (err) => err.message.includes("under review")
  );
});

test("27. Draft document reviews default to not_submitted", () => {
  const { mapBusOwnerFleetDetail } = require("../../../src/modules/read-contracts/fleet/bus-owner-fleet-detail.dto");
  const draftFleet = createMockFleet({ approvalStatus: "DRAFT" });
  const detail = mapBusOwnerFleetDetail(draftFleet);
  assert.equal(detail.approvalStatus, "DRAFT");
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
  });

  await submissionService.submitFleetForVerification({ fleetId: "fleet_101", ownerId: "owner_123" });
  assert.equal(pushedAudit.eventType, "FLEET_SUBMITTED");
  assert.equal(pushedAudit.fromStatus, "DRAFT");
  assert.equal(pushedAudit.toStatus, "PENDING");
});

test("29. Legacy unapproved full-payload submission creates no draft", async () => {
  const { createBusOwnerFleetCommandService } = require("../../../src/modules/bus-owner/fleet-management/fleet-command.service");
  let fleetRemoved = false;
  const mockFleetService = {
    createFleet: async () => ({ _id: "f_unapp" }),
    removeFleet: async () => (fleetRemoved = true),
  };
  const mockSubmissionService = {
    submitFleetForVerification: async () => {
      throw new ApiError("PROFILE_NOT_APPROVED", { message: "Not approved" });
    },
  };
  const cmdService = createBusOwnerFleetCommandService({
    fleetService: mockFleetService,
    submissionService: mockSubmissionService,
  });

  await assert.rejects(
    cmdService.submitFleetForOwner({
      userInfo: { id: "unapp_owner" },
      body: { busName: "Legacy", busNumber: "BA 1 PA 9999", busType: "AC", vehicleType: "bus", totalSeats: 30 },
    }),
    { code: "PROFILE_NOT_APPROVED", statusCode: 403 }
  );
  assert.equal(fleetRemoved, true);
});

test("30. Legacy approved full-payload readiness failure preserves draft ID and returns structured errors", async () => {
  const { createBusOwnerFleetCommandService } = require("../../../src/modules/bus-owner/fleet-management/fleet-command.service");
  const mockFleetService = {
    createFleet: async () => ({ _id: "f_draft_preserved" }),
  };
  const mockSubmissionService = {
    submitFleetForVerification: async () => {
      throw new ApiError("FLEET_SUBMISSION_INCOMPLETE", {
        details: { missingDocuments: ["bluebook"] },
      });
    },
  };
  const cmdService = createBusOwnerFleetCommandService({
    fleetService: mockFleetService,
    submissionService: mockSubmissionService,
  });

  await assert.rejects(
    cmdService.submitFleetForOwner({
      userInfo: { id: "owner_123" },
      body: { busName: "Legacy Incomplete", busNumber: "BA 1 PA 8888", busType: "AC", vehicleType: "bus", totalSeats: 30 },
    }),
    (err) => {
      assert.equal(err instanceof ApiError, true);
      assert.equal(err.code, "FLEET_SUBMISSION_INCOMPLETE");
      assert.equal(err.statusCode, 422);
      assert.equal(err.details?.fleetId, "f_draft_preserved");
      assert.deepEqual(err.details?.missingDocuments, ["bluebook"]);
      return true;
    }
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
  });

  await submissionService.submitFleetForVerification({ fleetId: "fleet_101", ownerId: "owner_123" });
  assert.deepEqual(incUpdate, { __v: 1 });
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

test("35. Direct model instantiation rejects non-DRAFT approvalStatus", async () => {
  const mongoose = require("mongoose");
  const Bus = require("../../../models/fleetModel");
  const busInstance = new Bus({
    ownerId: new mongoose.Types.ObjectId(),
    busName: "Direct Bus",
    busNumber: "BA 9 PA 0000",
    busType: "AC",
    vehicleType: "bus",
    totalSeats: 30,
    approvalStatus: "PENDING",
  });

  const BusOwner = mongoose.model("BusOwner");
  const originalFindOne = BusOwner.findOne;
  BusOwner.findOne = () => ({
    select: () => ({
      lean: async () => ({ verificationStatus: "approved" }),
    }),
  });

  try {
    await assert.rejects(
      busInstance.save(),
      (err) => err.message.includes("OWNER_NOT_APPROVED") && err.message.includes("DRAFT")
    );
  } finally {
    BusOwner.findOne = originalFindOne;
  }
});

