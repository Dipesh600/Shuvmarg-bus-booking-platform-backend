"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createKycSubmissionService } = require("../../../src/modules/bus-owner/kyc-submission/kyc-submission.service");
const { PDF_BUFFER, makeFile, makeValidFiles } = require("./helpers/kyc-test-fixtures");

test("kyc-submission.service failure and rollback tests", async (t) => {
  await t.test("zero side effects: invalid files do not trigger uploadService or DB save", async () => {
    let uploadCalls = 0;
    let dbSaved = false;

    function MockBusOwner(val) {
      Object.assign(this, val);
      this.save = async () => { dbSaved = true; };
    }
    MockBusOwner.findOne = async () => null;

    const service = createKycSubmissionService({
      BusOwner: MockBusOwner,
      uploadService: {
        uploadMany: async () => {
          uploadCalls++;
          return [{ url: "http://example.com/doc.pdf", publicId: "pub1" }];
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

  await t.test("rollback cleanup: partial upload failure triggers deleteMany for uploaded assets", async () => {
    const deletedPublicIds = [];
    let uploadCalls = 0;

    function MockBusOwner(val) {
      Object.assign(this, val);
      this.save = async () => {};
    }
    MockBusOwner.findOne = async () => null;

    const service = createKycSubmissionService({
      BusOwner: MockBusOwner,
      uploadService: {
        uploadMany: async (files, folder) => {
          uploadCalls++;
          if (folder.includes("tax_registration")) {
            throw new Error("Cloudinary connection reset");
          }
          return [{ url: `http://example.com/${folder}.pdf`, publicId: `pub-${uploadCalls}` }];
        },
        deleteMany: async (ids) => {
          deletedPublicIds.push(...ids);
        },
      },
    });

    await assert.rejects(
      async () => service.submitKyc({ userId: "user-1", files: makeValidFiles() }),
      (err) => err.message === "Cloudinary connection reset"
    );

    assert.deepEqual(deletedPublicIds, ["pub-1"]);
  });

  await t.test("rollback cleanup: DB save failure deletes all uploaded assets", async () => {
    const deletedPublicIds = [];
    let uploadCalls = 0;

    function MockBusOwner(val) {
      Object.assign(this, val);
      this.save = async () => { throw new Error("Mongo Write Conflict"); };
    }
    MockBusOwner.findOne = async () => null;

    const service = createKycSubmissionService({
      BusOwner: MockBusOwner,
      uploadService: {
        uploadMany: async (files, folder) => {
          uploadCalls++;
          return [{ url: `http://example.com/${folder}.pdf`, publicId: `pub-${uploadCalls}` }];
        },
        deleteMany: async (ids) => {
          deletedPublicIds.push(...ids);
        },
      },
    });

    await assert.rejects(
      async () => service.submitKyc({ userId: "user-1", files: makeValidFiles() }),
      (err) => err.message === "Mongo Write Conflict"
    );

    assert.equal(uploadCalls, 3);
    assert.deepEqual(deletedPublicIds, ["pub-1", "pub-2", "pub-3"]);
  });
});
