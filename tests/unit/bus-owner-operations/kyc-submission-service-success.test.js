"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createKycSubmissionService } = require("../../../src/modules/bus-owner/kyc-submission/kyc-submission.service");
const { makeValidFiles } = require("./helpers/kyc-test-fixtures");

test("kyc-submission.service success and state tests", async (t) => {
  await t.test("state rules: approved or pending state blocks resubmission with HTTP 409", async () => {
    function MockBusOwner(val) { Object.assign(this, val); }
    MockBusOwner.findOne = async () => ({ verificationStatus: "approved" });

    const serviceApproved = createKycSubmissionService({ BusOwner: MockBusOwner, storageService: {} });
    await assert.rejects(
      async () => serviceApproved.submitKyc({ userId: "user-1", files: makeValidFiles() }),
      (err) => err.code === "KYC_SUBMISSION_STATE_CONFLICT" && err.statusCode === 409
    );

    MockBusOwner.findOne = async () => ({ verificationStatus: "pending" });
    const servicePending = createKycSubmissionService({ BusOwner: MockBusOwner, storageService: {} });
    await assert.rejects(
      async () => servicePending.submitKyc({ userId: "user-1", files: makeValidFiles() }),
      (err) => err.code === "KYC_SUBMISSION_STATE_CONFLICT" && err.statusCode === 409
    );
  });

  await t.test("rejected state allows resubmission, saves new keys first, then deletes replaced old S3 keys", async () => {
    const callOrder = [];
    let savedOwner;

    function MockBusOwner(val) {
      Object.assign(this, val);
      this.save = async () => {
        callOrder.push("save");
        savedOwner = this;
      };
    }

    const oldOwnerData = {
      verificationStatus: "rejected",
      companyRegistration: { documentUrls: ["owners/1/old-c.pdf", "owners/1/old-c.pdf"] },
      taxRegistration: { documentUrls: ["https://cloudinary.com/old-t.pdf"] },
      transportLicense: { documentUrls: ["owners/1/old-l.pdf"] },
      insuranceCertificates: [{ documentUrls: ["owners/1/old-i.pdf"] }],
      ownerIdentity: { documentUrls: ["owners/1/old-identity.pdf"] },
    };

    MockBusOwner.findOne = async () => new MockBusOwner(oldOwnerData);

    const service = createKycSubmissionService({
      BusOwner: MockBusOwner,
      storageService: {
        uploadDocument: async ({ documentType }) => {
          callOrder.push(`upload:${documentType}`);
          return `owners/1/new-${documentType}.pdf`;
        },
        deleteMany: async (keys) => {
          callOrder.push(`delete-old:${keys.join(",")}`);
          return { deleted: keys, failed: [] };
        },
      },
    });

    const res = await service.submitKyc({ userId: "user-1", files: makeValidFiles() });
    assert.equal(res.success, true);
    assert.equal(savedOwner.verificationStatus, "pending");
    assert.equal(savedOwner.rejectionReason, null);

    assert.deepEqual(callOrder, [
      "upload:companyRegistration",
      "upload:taxRegistration",
      "upload:transportLicense",
      "save",
      "delete-old:owners/1/old-c.pdf,https://cloudinary.com/old-t.pdf,owners/1/old-l.pdf,owners/1/old-i.pdf",
    ]);
  });

  await t.test("old cleanup failure logs via logger.error but returns submission success", async () => {
    const loggedErrors = [];
    function MockBusOwner(val) {
      Object.assign(this, val);
      this.save = async () => {};
    }
    MockBusOwner.findOne = async () => new MockBusOwner({
      verificationStatus: "rejected",
      companyRegistration: { documentUrls: ["owners/1/old-c.pdf"] },
    });

    const mockLogger = {
      error: (...args) => loggedErrors.push(args),
    };

    const service = createKycSubmissionService({
      BusOwner: MockBusOwner,
      logger: mockLogger,
      storageService: {
        uploadDocument: async ({ documentType }) => `owners/1/new-${documentType}.pdf`,
        deleteMany: async () => ({ deleted: [], failed: ["owners/1/old-c.pdf"] }),
      },
    });

    const res = await service.submitKyc({ userId: "user-1", files: makeValidFiles() });
    assert.equal(res.success, true);
    assert.equal(loggedErrors.length, 1);
    assert.equal(loggedErrors[0][0], "KYC replaced-document cleanup failures:");
    assert.deepEqual(loggedErrors[0][1], ["owners/1/old-c.pdf"]);
  });
});
