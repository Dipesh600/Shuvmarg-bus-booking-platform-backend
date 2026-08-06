"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createKycSubmissionService } = require("../../../src/modules/bus-owner/kyc-submission/kyc-submission.service");
const { makeValidFiles } = require("./helpers/kyc-test-fixtures");
const { PDF_BUFFER, makeFile } = require("./helpers/kyc-test-fixtures");

const VALID_BODY = {
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

test("kyc-submission.service failure and rollback tests", async (t) => {
  await t.test("zero side effects: invalid files do not trigger storageService, DB save, or old document deletion", async () => {
    let uploadCalls = 0;
    let deleteCalls = 0;

    function MockBusOwner(val) {
      Object.assign(this, val);
      this.save = async () => {};
    }
    MockBusOwner.findOne = async () => new MockBusOwner({
      verificationStatus: "rejected",
      companyRegistration: { documentUrls: ["owners/1/old.pdf"] },
    });

    const service = createKycSubmissionService({
      BusOwner: MockBusOwner,
      storageService: {
        uploadDocument: async () => { uploadCalls++; return "owners/1/doc.pdf"; },
        deleteMany: async () => { deleteCalls++; return { deleted: [], failed: [] }; },
      },
    });

    const invalidFiles = { companyRegistration: makeFile("company.pdf", "application/pdf", PDF_BUFFER) };

    await assert.rejects(
      async () => service.submitKyc({ userId: "user-1", onboardingData: VALID_BODY, files: invalidFiles }),
      (err) => err.code === "KYC_REQUIRED_DOCUMENT_MISSING"
    );

    assert.equal(uploadCalls, 0);
    assert.equal(deleteCalls, 0);
  });

  await t.test("first upload failure performs zero rollback deletions and does not delete old documents", async () => {
    const deletedObjectKeys = [];

    function MockBusOwner(val) {
      Object.assign(this, val);
      this.save = async () => {};
    }
    MockBusOwner.findOne = async () => new MockBusOwner({
      verificationStatus: "rejected",
      companyRegistration: { documentUrls: ["owners/1/old.pdf"] },
    });

    const service = createKycSubmissionService({
      BusOwner: MockBusOwner,
      storageService: {
        uploadDocument: async () => { throw new Error("S3 Upload 1 Failed"); },
        deleteMany: async (keys) => { deletedObjectKeys.push(...keys); return { deleted: keys, failed: [] }; },
      },
    });

    await assert.rejects(
      async () => service.submitKyc({ userId: "user-1", onboardingData: VALID_BODY, files: makeValidFiles() }),
      (err) => err.message === "S3 Upload 1 Failed"
    );

    assert.deepEqual(deletedObjectKeys, []);
  });

  await t.test("partial upload failure deletes only newly uploaded keys and does not delete old rejected keys", async () => {
    const deletedObjectKeys = [];
    let uploadCalls = 0;

    function MockBusOwner(val) {
      Object.assign(this, val);
      this.save = async () => {};
    }
    MockBusOwner.findOne = async () => new MockBusOwner({
      verificationStatus: "rejected",
      companyRegistration: { documentUrls: ["owners/1/old-c.pdf"] },
    });

    const service = createKycSubmissionService({
      BusOwner: MockBusOwner,
      storageService: {
        uploadDocument: async ({ documentType }) => {
          uploadCalls++;
          if (documentType === "taxRegistration") {
            throw new Error("S3 Upload Failed");
          }
          return `owners/1/kyc/${documentType}/new-${uploadCalls}.pdf`;
        },
        deleteMany: async (keys) => {
          deletedObjectKeys.push(...keys);
          return { deleted: keys, failed: [] };
        },
      },
    });

    await assert.rejects(
      async () => service.submitKyc({ userId: "user-1", onboardingData: VALID_BODY, files: makeValidFiles() }),
      (err) => err.message === "S3 Upload Failed"
    );

    assert.deepEqual(deletedObjectKeys, ["owners/1/kyc/companyRegistration/new-1.pdf"]);
  });

  await t.test("DB save failure deletes only newly uploaded keys and does not delete old rejected keys", async () => {
    const deletedObjectKeys = [];
    let uploadCalls = 0;

    function MockBusOwner(val) {
      Object.assign(this, val);
      this.save = async () => { throw new Error("Mongo Write Conflict"); };
    }
    MockBusOwner.findOne = async () => new MockBusOwner({
      verificationStatus: "rejected",
      companyRegistration: { documentUrls: ["owners/1/old-c.pdf"] },
    });

    const service = createKycSubmissionService({
      BusOwner: MockBusOwner,
      storageService: {
        uploadDocument: async ({ documentType }) => {
          uploadCalls++;
          return `owners/1/kyc/${documentType}/new-${uploadCalls}.pdf`;
        },
        deleteMany: async (keys) => {
          deletedObjectKeys.push(...keys);
          return { deleted: keys, failed: [] };
        },
      },
    });

    await assert.rejects(
      async () => service.submitKyc({ userId: "user-1", onboardingData: VALID_BODY, files: makeValidFiles() }),
      (err) => err.message === "Mongo Write Conflict"
    );

    assert.equal(uploadCalls, 3);
    assert.deepEqual(deletedObjectKeys, [
      "owners/1/kyc/companyRegistration/new-1.pdf",
      "owners/1/kyc/taxRegistration/new-2.pdf",
      "owners/1/kyc/transportLicense/new-3.pdf",
    ]);
  });
});
