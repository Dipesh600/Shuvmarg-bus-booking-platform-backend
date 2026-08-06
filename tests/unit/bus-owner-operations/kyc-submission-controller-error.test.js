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

test("bus-owner KYC submission controller error handling contracts", async (t) => {
  await t.test("controller returns HTTP 400 KYC_INVALID_FILE_PAYLOAD for malformed file object without storage calls", async () => {
    let storageCalled = false;
    let saveCalled = false;
    function MockBusOwner(val) {
      Object.assign(this, val);
      this.save = async () => { saveCalled = true; };
    }
    MockBusOwner.findOne = async () => null;

    const controller = createKycSubmissionController({
      BusOwner: MockBusOwner,
      User: MockUser,
      mongoose: mockMongoose,
      storageService: { uploadDocument: async () => { storageCalled = true; return ""; } },
    });

    const malformedFiles = makeValidFiles();
    malformedFiles.companyRegistration = [null];

    const res = responseRecorder();
    await controller.submitBusOwnerKyc(
      { userInfo: { id: "owner" }, body: VALID_BODY, files: malformedFiles },
      res
    );

    assert.equal(res.result().status, 400);
    assert.equal(res.result().body.success, false);
    assert.equal(res.result().body.code, "KYC_INVALID_FILE_PAYLOAD");
    assert.equal(storageCalled, false);
    assert.equal(saveCalled, false);
  });

  await t.test("controller returns sanitized HTTP 500 without leaking stack or internal error text", async () => {
    function BusOwner() {}
    BusOwner.findOne = async () => { throw new Error("Sensitive DB connection string"); };

    const controller = createKycSubmissionController({
      BusOwner, User: MockUser, mongoose: mockMongoose, storageService: {},
    });
    const res = responseRecorder();
    await controller.submitBusOwnerKyc(
      { userInfo: { id: "owner" }, body: VALID_BODY, files: makeValidFiles() },
      res
    );

    assert.equal(res.result().status, 500);
    assert.equal(res.result().body.success, false);
    assert.equal(res.result().body.message, "Internal Server Error");
    assert.equal("error" in res.result().body, false);
  });
});
