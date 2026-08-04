"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createKycSubmissionController } = require("../../../src/modules/bus-owner/kyc-submission/kyc-submission.controller");
const { responseRecorder } = require("./helpers/kyc-test-fixtures");

test("bus-owner KYC submission controller status contracts", async (t) => {
  await t.test("status response exposes only the legacy KYC fields", async () => {
    const owner = {
      verificationStatus: "pending",
      rejectionReason: null,
      companyRegistration: { verified: false },
      ignored: "secret",
    };
    const controller = createKycSubmissionController({
      BusOwner: { findOne: () => ({ lean: async () => owner }) },
      uploadService: {},
    });
    const res = responseRecorder();
    await controller.getMyBusOwnerKycStatus({ userInfo: { id: "owner" } }, res);

    assert.equal(res.result().status, 200);
    assert.equal(res.result().body.data.verificationStatus, "pending");
    assert.equal("ignored" in res.result().body.data, false);
  });

  await t.test("status response returns 404 when KYC record is missing", async () => {
    const controller = createKycSubmissionController({
      BusOwner: { findOne: () => ({ lean: async () => null }) },
      uploadService: {},
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
      uploadService: {},
    });
    const res = responseRecorder();
    await controller.getMyBusOwnerKycStatus({ userInfo: { id: "owner" } }, res);

    assert.equal(res.result().status, 500);
    assert.equal(res.result().body.success, false);
    assert.equal(res.result().body.message, "Internal Server Error");
    assert.equal("error" in res.result().body, false);
  });

  await t.test("both submit and status endpoints preserve unauthorized response when userInfo is missing", async () => {
    const controller = createKycSubmissionController({ BusOwner: {}, uploadService: {} });
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
