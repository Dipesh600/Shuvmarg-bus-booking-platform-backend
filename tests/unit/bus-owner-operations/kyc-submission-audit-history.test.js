"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createKycSubmissionService } = require("../../../src/modules/bus-owner/kyc-submission/kyc-submission.service");

test("kyc-submission-audit-history unit tests", async (t) => {
  const userId = "64f000000000000000000002";
  const fixedDate = new Date("2026-08-05T12:00:00Z");
  const pdfBuffer = Buffer.concat([Buffer.from("%PDF-1.4\n%"), Buffer.alloc(100)]);
  const makeFile = (name) => ({ fieldname: name, originalname: `${name}.pdf`, buffer: pdfBuffer, mimetype: "application/pdf" });

  const validFiles = {
    companyRegistration: [makeFile("companyRegistration")],
    taxRegistration: [makeFile("taxRegistration")],
    transportLicense: [makeFile("transportLicense")],
  };

  const validBody = {
    companyName: "Nepal Transport Co.",
    ownerName: "Raju Shrestha",
    address: "Kathmandu, Nepal",
    panNumber: "123456789",
    registrationNumber: "REG-001",
    bankName: "Nepal Bank",
    accountHolderName: "Raju Shrestha",
    accountNumber: "12345678901234",
    branchName: "Newroad Branch",
  };

  const mockStorageService = {
    uploadDocument: async () => "kyc-docs/key-1.pdf",
    deleteMany: async () => ({ failed: [] }),
  };

  await t.test("new owner record (even with schema-default pending status) is initial submission and appends KYC_SUBMITTED", async () => {
    let savedOwner = null;
    const MockBusOwner = function (data) {
      Object.assign(this, data);
      this.verificationStatus = "pending"; // schema default
      this.kycAuditHistory = undefined; // uninitialized on new record
      this.save = async function () { savedOwner = this; };
    };
    MockBusOwner.findOne = async () => null; // Record does not exist in DB

    const service = createKycSubmissionService({
      BusOwner: MockBusOwner,
      storageService: mockStorageService,
      clock: () => fixedDate,
    });

    const res = await service.submitKyc({ userId, onboardingData: validBody, files: validFiles });
    assert.equal(res.success, true);
    assert.ok(savedOwner, "Save must be called");
    assert.equal(savedOwner.kycAuditHistory.length, 1);
    const event = savedOwner.kycAuditHistory[0];
    assert.equal(event.eventType, "KYC_SUBMITTED");
    assert.equal(event.actorType, "BUS_OWNER");
    assert.equal(event.actorId, userId);
    assert.equal(event.fromStatus, null);
    assert.equal(event.toStatus, "pending");
    assert.deepEqual(event.metadata, { documentCount: 3 });
  });

  await t.test("existing pending owner in DB is rejected as duplicate and appends no event", async () => {
    const existingOwner = { user: userId, verificationStatus: "pending", kycAuditHistory: [] };
    const MockBusOwner = { findOne: async () => existingOwner };
    const service = createKycSubmissionService({ BusOwner: MockBusOwner, storageService: mockStorageService });

    await assert.rejects(
      async () => service.submitKyc({ userId, onboardingData: validBody, files: validFiles }),
      (err) => err.code === "KYC_SUBMISSION_STATE_CONFLICT" && err.statusCode === 409
    );
    assert.equal(existingOwner.kycAuditHistory.length, 0);
  });

  await t.test("rejected resubmission appends KYC_RESUBMITTED with fromStatus 'rejected'", async () => {
    let savedOwner = null;
    const existingRejected = {
      _id: "64f000000000000000000001",
      user: userId,
      verificationStatus: "rejected",
      kycAuditHistory: [{ eventType: "KYC_SUBMITTED", actorType: "BUS_OWNER", actorId: userId, fromStatus: null, toStatus: "pending", occurredAt: fixedDate, metadata: { documentCount: 3 } }],
      save: async function () { savedOwner = this; },
    };

    const MockBusOwner = { findOne: async () => existingRejected };
    const service = createKycSubmissionService({ BusOwner: MockBusOwner, storageService: mockStorageService, clock: () => fixedDate });

    const res = await service.submitKyc({ userId, onboardingData: validBody, files: validFiles });
    assert.equal(res.success, true);
    assert.equal(savedOwner.kycAuditHistory.length, 2);
    const resubEvent = savedOwner.kycAuditHistory[1];
    assert.equal(resubEvent.eventType, "KYC_RESUBMITTED");
    assert.equal(resubEvent.fromStatus, "rejected");
    assert.equal(resubEvent.toStatus, "pending");
  });

  await t.test("save failure rolls back uploads and does not persist audit event", async () => {
    let rollbackCount = 0;
    const MockBusOwner = function (data) {
      Object.assign(this, data);
      this.save = async function () { throw new Error("DB Save Error"); };
    };
    MockBusOwner.findOne = async () => null;

    const storage = {
      uploadDocument: async () => "kyc-docs/temp-key.pdf",
      deleteMany: async (keys) => { rollbackCount = keys.length; },
    };

    const service = createKycSubmissionService({ BusOwner: MockBusOwner, storageService: storage });
    await assert.rejects(async () => service.submitKyc({ userId, onboardingData: validBody, files: validFiles }), (err) => err.message === "DB Save Error");
    assert.equal(rollbackCount, 3);
  });
});
