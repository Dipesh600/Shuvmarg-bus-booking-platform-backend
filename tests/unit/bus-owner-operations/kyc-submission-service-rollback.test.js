"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createKycSubmissionService } = require("../../../src/modules/bus-owner/kyc-submission/kyc-submission.service");
const { makeValidFiles } = require("./helpers/kyc-test-fixtures");

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

const MockUser = {
  findById: async () => ({ name: null, address: null, save: async () => {} }),
};

const mockMongoose = {
  startSession: async () => ({
    withTransaction: async (fn) => { await fn(); },
    endSession: async () => {},
  }),
};

test("kyc-submission.service upload rollback tests", async (t) => {
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
      User: MockUser,
      mongoose: mockMongoose,
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

    const mockFailingMongoose = {
      startSession: async () => ({
        withTransaction: async (fn) => { await fn(); },
        endSession: async () => {},
      }),
    };

    const service = createKycSubmissionService({
      BusOwner: MockBusOwner,
      User: MockUser,
      mongoose: mockFailingMongoose,
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
