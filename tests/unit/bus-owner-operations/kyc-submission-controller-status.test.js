"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createKycSubmissionController } = require("../../../src/modules/bus-owner/kyc-submission/kyc-submission.controller");
const { createKycDocumentReadService } = require("../../../src/modules/bus-owner/kyc-submission/kyc-document-read.service");
const { responseRecorder } = require("./helpers/kyc-test-fixtures");

test("bus-owner KYC submission controller status contracts", async (t) => {
  await t.test("status response resolves S3 keys into presigned viewUrls and documentReferences", async () => {
    const owner = {
      verificationStatus: "pending",
      rejectionReason: null,
      companyRegistration: { documentUrls: ["owners/1/kyc/company/doc.pdf"] },
      ignored: "secret",
    };
    const kycDocumentReadService = createKycDocumentReadService({
      getPresignedUrl: async (key) => `https://presigned/${key}`,
    });

    const controller = createKycSubmissionController({
      BusOwner: { findOne: () => ({ lean: async () => owner }) },
      storageService: {},
      kycDocumentReadService,
    });
    const res = responseRecorder();
    await controller.getMyBusOwnerKycStatus({ userInfo: { id: "owner" } }, res);

    assert.equal(res.result().status, 200);
    assert.equal(res.result().body.data.verificationStatus, "pending");
    assert.equal(res.result().body.data.companyRegistration.documentUrls[0], "https://presigned/owners/1/kyc/company/doc.pdf");
    assert.equal(res.result().body.data.companyRegistration.documentReferences[0].storageReference, "owners/1/kyc/company/doc.pdf");
    assert.equal("ignored" in res.result().body.data, false);
  });

  await t.test("status response returns 404 when KYC record is missing", async () => {
    const controller = createKycSubmissionController({
      BusOwner: { findOne: () => ({ lean: async () => null }) },
      storageService: {},
    });
    const res = responseRecorder();
    await controller.getMyBusOwnerKycStatus({ userInfo: { id: "owner" } }, res);

    assert.equal(res.result().status, 404);
    assert.equal(res.result().body.success, false);
    assert.equal(res.result().body.message, "Bus owner KYC not found. Please submit your KYC.");
  });

  await t.test("status response sanitizes DB connection error into HTTP 500", async () => {
    const controller = createKycSubmissionController({
      BusOwner: { findOne: () => { throw new Error("Sensitive DB connection string"); } },
      storageService: {},
    });
    const res = responseRecorder();
    await controller.getMyBusOwnerKycStatus({ userInfo: { id: "owner" } }, res);

    assert.equal(res.result().status, 500);
    assert.equal(res.result().body.success, false);
    assert.equal(res.result().body.message, "Internal Server Error");
    assert.equal("error" in res.result().body, false);
  });

  await t.test("both submit and status endpoints preserve unauthorized response when userInfo is missing", async () => {
    const controller = createKycSubmissionController({ BusOwner: {}, storageService: {} });
    for (const handler of [controller.submitBusOwnerKyc, controller.getMyBusOwnerKycStatus]) {
      const res = responseRecorder();
      await handler({}, res);
      assert.deepEqual(res.result(), {
        status: 401,
        body: {
          success: false,
          message: "Unauthorized. Please login first.",
        },
      });
    }
  });
});
