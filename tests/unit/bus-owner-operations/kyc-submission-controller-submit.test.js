"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createKycSubmissionController } = require("../../../src/modules/bus-owner/kyc-submission/kyc-submission.controller");
const { makeValidFiles, responseRecorder } = require("./helpers/kyc-test-fixtures");

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

test("bus-owner KYC submission controller submit contracts", async (t) => {
  await t.test("submission creates owner and sets all document state upon valid payload", async () => {
    const uploads = [];
    let created;
    function BusOwner(value) {
      created = Object.assign(this, value);
      this.save = async () => { this.saved = true; };
    }
    BusOwner.findOne = async () => null;

    const controller = createKycSubmissionController({
      BusOwner, User: MockUser, mongoose: mockMongoose,
      storageService: {
        uploadDocument: async ({ documentType }) => {
          uploads.push(documentType);
          return `owners/owner/kyc/${documentType}/uuid.pdf`;
        },
      },
    });

    const validFiles = makeValidFiles();

    const res = responseRecorder();
    await controller.submitBusOwnerKyc(
      { userInfo: { id: "owner" }, body: VALID_BODY, files: validFiles },
      res
    );

    assert.equal(res.result().status, 200);
    assert.equal(created.user, "owner");
    assert.deepEqual(created.companyRegistration, {
      documentUrls: ["owners/owner/kyc/companyRegistration/uuid.pdf"],
      verified: false,
      rejectionReason: null,
    });
    assert.equal(created.verificationStatus, "pending");
    assert.equal(created.saved, true);
    assert.equal(uploads.length, 3);
  });

  await t.test("controller returns HTTP 400 with onboarding validation error when body is missing", async () => {
    function MockBusOwner(val) { Object.assign(this, val); }
    MockBusOwner.findOne = async () => null;

    const controller = createKycSubmissionController({
      BusOwner: MockBusOwner, User: MockUser, mongoose: mockMongoose, storageService: {},
    });
    const res = responseRecorder();
    await controller.submitBusOwnerKyc({ userInfo: { id: "owner" }, body: undefined, files: makeValidFiles() }, res);

    assert.equal(res.result().status, 400);
    assert.equal(res.result().body.success, false);
    assert.equal(res.result().body.code, "BUS_OWNER_ONBOARDING_VALIDATION_FAILED");
  });

  await t.test("controller returns HTTP 400 KYC_FILES_REQUIRED when body is valid but no files sent", async () => {
    function MockBusOwner(val) { Object.assign(this, val); }
    MockBusOwner.findOne = async () => null;

    const controller = createKycSubmissionController({
      BusOwner: MockBusOwner, User: MockUser, mongoose: mockMongoose, storageService: {},
    });
    const res = responseRecorder();
    await controller.submitBusOwnerKyc({ userInfo: { id: "owner" }, body: VALID_BODY, files: {} }, res);

    assert.equal(res.result().status, 400);
    assert.equal(res.result().body.success, false);
    assert.equal(res.result().body.code, "KYC_FILES_REQUIRED");
  });
});
