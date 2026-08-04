"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createKycSubmissionService,
} = require("../../../src/modules/bus-owner/kyc-submission/kyc-submission.service");

const PDF_BUFFER = Buffer.concat([Buffer.from("%PDF-1.4\n%"), Buffer.alloc(100)]);
const JPEG_BUFFER = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100)]);
const PNG_BUFFER = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100)]);

function makeFile(name, mimetype, buffer) {
  return { name, mimetype, data: buffer, size: buffer.length };
}

function makeValidFiles() {
  return {
    companyRegistration: makeFile("company.pdf", "application/pdf", PDF_BUFFER),
    taxRegistration: makeFile("tax.jpg", "image/jpeg", JPEG_BUFFER),
    transportLicense: makeFile("license.png", "image/png", PNG_BUFFER),
  };
}

test("kyc-submission.service unit and rollback tests", async (t) => {
  await t.test("zero side effects: invalid files do not trigger uploadService or DB save", async () => {
    let uploadCalls = 0;
    let dbSaved = false;

    const BusOwner = {
      findOne: async () => null,
    };
    function MockBusOwner(val) {
      Object.assign(this, val);
      this.save = async () => { dbSaved = true; };
    }
    BusOwner.prototype = MockBusOwner.prototype;

    const service = createKycSubmissionService({
      BusOwner: Object.assign(MockBusOwner, BusOwner),
      uploadService: {
        uploadMany: async () => {
          uploadCalls++;
          return [{ url: "http://example.com/doc.pdf", publicId: "pub1" }];
        },
      },
    });

    // Invalid files payload (missing taxRegistration)
    const invalidFiles = {
      companyRegistration: makeFile("company.pdf", "application/pdf", PDF_BUFFER),
    };

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
      this.save = async () => {
        throw new Error("Mongo Write Conflict");
      };
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

  await t.test("state rules: approved or pending state blocks resubmission with HTTP 409", async () => {
    function MockBusOwner(val) { Object.assign(this, val); }
    MockBusOwner.findOne = async () => ({ verificationStatus: "approved" });

    const serviceApproved = createKycSubmissionService({
      BusOwner: MockBusOwner,
      uploadService: {},
    });

    await assert.rejects(
      async () => serviceApproved.submitKyc({ userId: "user-1", files: makeValidFiles() }),
      (err) => err.code === "KYC_SUBMISSION_STATE_CONFLICT" && err.statusCode === 409
    );

    MockBusOwner.findOne = async () => ({ verificationStatus: "pending" });
    const servicePending = createKycSubmissionService({
      BusOwner: MockBusOwner,
      uploadService: {},
    });

    await assert.rejects(
      async () => servicePending.submitKyc({ userId: "user-1", files: makeValidFiles() }),
      (err) => err.code === "KYC_SUBMISSION_STATE_CONFLICT" && err.statusCode === 409
    );
  });

  await t.test("state rules: rejected state allows resubmission and resets status to pending", async () => {
    let savedOwner;
    function MockBusOwner(val) {
      Object.assign(this, val);
      this.save = async () => { savedOwner = this; };
    }
    MockBusOwner.findOne = async () => new MockBusOwner({ verificationStatus: "rejected", rejectionReason: "Bad tax doc" });

    const service = createKycSubmissionService({
      BusOwner: MockBusOwner,
      uploadService: {
        uploadMany: async (files, folder) => [{ url: `http://example.com/${folder}.pdf`, publicId: `pub-1` }],
      },
    });

    const res = await service.submitKyc({ userId: "user-1", files: makeValidFiles() });
    assert.equal(res.success, true);
    assert.equal(savedOwner.verificationStatus, "pending");
    assert.equal(savedOwner.rejectionReason, null);
  });
});
