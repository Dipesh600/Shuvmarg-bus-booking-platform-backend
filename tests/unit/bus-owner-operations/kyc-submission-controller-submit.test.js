"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createKycSubmissionController } = require("../../../src/modules/bus-owner/kyc-submission/kyc-submission.controller");
const { PDF_BUFFER, makeFile, makeValidFiles, responseRecorder } = require("./helpers/kyc-test-fixtures");

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
      BusOwner,
      storageService: {
        uploadDocument: async ({ documentType }) => {
          uploads.push(documentType);
          return `owners/owner/kyc/${documentType}/uuid.pdf`;
        },
      },
    });

    const validFiles = makeValidFiles();
    validFiles.insuranceCertificates = [makeFile("ins.pdf", "application/pdf", PDF_BUFFER)];

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
    assert.equal(uploads.length, 4);
  });

  await t.test("controller returns HTTP 400 with onboarding validation error when body is missing", async () => {
    function MockBusOwner(val) { Object.assign(this, val); }
    MockBusOwner.findOne = async () => null;

    const controller = createKycSubmissionController({ BusOwner: MockBusOwner, storageService: {} });
    const res = responseRecorder();
    // No body — body validation fires before file validation
    await controller.submitBusOwnerKyc({ userInfo: { id: "owner" }, body: undefined, files: makeValidFiles() }, res);

    assert.equal(res.result().status, 400);
    assert.equal(res.result().body.success, false);
    assert.equal(res.result().body.code, "BUS_OWNER_ONBOARDING_VALIDATION_FAILED");
  });

  await t.test("controller returns HTTP 400 KYC_FILES_REQUIRED when body is valid but no files sent", async () => {
    function MockBusOwner(val) { Object.assign(this, val); }
    MockBusOwner.findOne = async () => null;

    const controller = createKycSubmissionController({ BusOwner: MockBusOwner, storageService: {} });
    const res = responseRecorder();
    await controller.submitBusOwnerKyc({ userInfo: { id: "owner" }, body: VALID_BODY, files: {} }, res);

    assert.equal(res.result().status, 400);
    assert.equal(res.result().body.success, false);
    assert.equal(res.result().body.code, "KYC_FILES_REQUIRED");
  });

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

    const controller = createKycSubmissionController({ BusOwner, storageService: {} });
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
