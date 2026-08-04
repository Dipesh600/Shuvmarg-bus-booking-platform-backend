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

  await t.test("state rules: rejected state allows resubmission and resets status to pending", async () => {
    let savedOwner;
    function MockBusOwner(val) {
      Object.assign(this, val);
      this.save = async () => { savedOwner = this; };
    }
    MockBusOwner.findOne = async () => new MockBusOwner({ verificationStatus: "rejected", rejectionReason: "Bad tax doc" });

    const service = createKycSubmissionService({
      BusOwner: MockBusOwner,
      storageService: {
        uploadDocument: async ({ documentType }) => `owners/user-1/kyc/${documentType}/uuid.pdf`,
      },
    });

    const res = await service.submitKyc({ userId: "user-1", files: makeValidFiles() });
    assert.equal(res.success, true);
    assert.equal(savedOwner.verificationStatus, "pending");
    assert.equal(savedOwner.rejectionReason, null);
    assert.equal(savedOwner.companyRegistration.documentUrls[0], "owners/user-1/kyc/companyRegistration/uuid.pdf");
  });
});
