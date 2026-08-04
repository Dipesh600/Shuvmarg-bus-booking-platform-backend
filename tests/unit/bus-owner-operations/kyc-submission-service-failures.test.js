"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createKycSubmissionService } = require("../../../src/modules/bus-owner/kyc-submission/kyc-submission.service");
const { PDF_BUFFER, makeFile, makeValidFiles } = require("./helpers/kyc-test-fixtures");

test("kyc-submission.service failure and rollback tests", async (t) => {
  await t.test("zero side effects: invalid files do not trigger storageService or DB save", async () => {
    let uploadCalls = 0;
    let dbSaved = false;

    function MockBusOwner(val) {
      Object.assign(this, val);
      this.save = async () => { dbSaved = true; };
    }
    MockBusOwner.findOne = async () => null;

    const service = createKycSubmissionService({
      BusOwner: MockBusOwner,
      storageService: {
        uploadDocument: async () => {
          uploadCalls++;
          return "owners/1/kyc/doc.pdf";
        },
      },
    });

    const invalidFiles = { companyRegistration: makeFile("company.pdf", "application/pdf", PDF_BUFFER) };

    await assert.rejects(
      async () => service.submitKyc({ userId: "user-1", files: invalidFiles }),
      (err) => err.code === "KYC_REQUIRED_DOCUMENT_MISSING"
    );

    assert.equal(uploadCalls, 0);
    assert.equal(dbSaved, false);
  });

  await t.test("rollback cleanup: partial upload failure triggers deleteMany for uploaded S3 object keys", async () => {
    const deletedObjectKeys = [];
    let uploadCalls = 0;

    function MockBusOwner(val) {
      Object.assign(this, val);
      this.save = async () => {};
    }
    MockBusOwner.findOne = async () => null;

    const service = createKycSubmissionService({
      BusOwner: MockBusOwner,
      storageService: {
        uploadDocument: async ({ documentType }) => {
          uploadCalls++;
          if (documentType === "taxRegistration") {
            throw new Error("S3 Upload Failed");
          }
          return `owners/1/kyc/${documentType}/key-${uploadCalls}.pdf`;
        },
        deleteMany: async (keys) => {
          deletedObjectKeys.push(...keys);
          return { deleted: keys, failed: [] };
        },
      },
    });

    await assert.rejects(
      async () => service.submitKyc({ userId: "user-1", files: makeValidFiles() }),
      (err) => err.message === "S3 Upload Failed"
    );

    assert.deepEqual(deletedObjectKeys, ["owners/1/kyc/companyRegistration/key-1.pdf"]);
  });

  await t.test("rollback cleanup: DB save failure deletes all uploaded S3 object keys", async () => {
    const deletedObjectKeys = [];
    let uploadCalls = 0;

    function MockBusOwner(val) {
      Object.assign(this, val);
      this.save = async () => { throw new Error("Mongo Write Conflict"); };
    }
    MockBusOwner.findOne = async () => null;

    const service = createKycSubmissionService({
      BusOwner: MockBusOwner,
      storageService: {
        uploadDocument: async ({ documentType }) => {
          uploadCalls++;
          return `owners/1/kyc/${documentType}/key-${uploadCalls}.pdf`;
        },
        deleteMany: async (keys) => {
          deletedObjectKeys.push(...keys);
          return { deleted: keys, failed: [] };
        },
      },
    });

    await assert.rejects(
      async () => service.submitKyc({ userId: "user-1", files: makeValidFiles() }),
      (err) => err.message === "Mongo Write Conflict"
    );

    assert.equal(uploadCalls, 3);
    assert.deepEqual(deletedObjectKeys, [
      "owners/1/kyc/companyRegistration/key-1.pdf",
      "owners/1/kyc/taxRegistration/key-2.pdf",
      "owners/1/kyc/transportLicense/key-3.pdf",
    ]);
  });
});
