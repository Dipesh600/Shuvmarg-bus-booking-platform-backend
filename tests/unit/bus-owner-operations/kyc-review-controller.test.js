"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createKycReviewController } = require("../../../src/modules/bus-owner/kyc-review/kyc-review.controller");

function createMockResponse() {
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(data) {
      res.body = data;
      return res;
    },
  };
  return res;
}

test("kyc-review-controller unit tests", async (t) => {
  const validId = "64f000000000000000000001";

  await t.test("unauthenticated request returns HTTP 401", async () => {
    const controller = createKycReviewController({ reviewService: {} });
    const req = { body: { id: validId, verificationStatus: "approved" } };
    const res = createMockResponse();

    await controller.updateBusOwnerKyc(req, res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, "Unauthorized: Reviewer identity is required.");
  });

  await t.test("successful review triggers notifyKycResult and returns HTTP 200", async () => {
    let notifiedResult = null;
    const mockServiceResult = { data: { busOwnerId: validId, verificationStatus: "approved" } };

    const mockReviewService = {
      reviewKyc: async (body, reviewerId) => {
        assert.equal(reviewerId, "admin-123");
        return mockServiceResult;
      },
    };

    const controller = createKycReviewController({
      reviewService: mockReviewService,
      notifyKycResult: async (result) => { notifiedResult = result; },
    });

    const req = {
      adminInfo: { id: "admin-123" },
      body: { id: validId, verificationStatus: "approved" },
    };
    const res = createMockResponse();

    await controller.updateBusOwnerKyc(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.message, "Bus owner KYC updated successfully!");
    assert.deepEqual(res.body.data, mockServiceResult.data);
    assert.equal(notifiedResult, mockServiceResult);
  });

  await t.test("domain error returns custom status code and message", async () => {
    const mockReviewService = {
      reviewKyc: async () => {
        const err = new Error("Cannot transition KYC review status from 'approved' to 'rejected'.");
        err.statusCode = 409;
        throw err;
      },
    };

    const controller = createKycReviewController({ reviewService: mockReviewService });
    const req = { user: { _id: "admin-456" }, body: { id: validId, verificationStatus: "rejected" } };
    const res = createMockResponse();

    await controller.updateBusOwnerKyc(req, res);
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, "Cannot transition KYC review status from 'approved' to 'rejected'.");
  });

  await t.test("internal error returns sanitized HTTP 500", async () => {
    const mockReviewService = {
      reviewKyc: async () => {
        throw new Error("Internal database crash: connection pool exhausted");
      },
    };

    const controller = createKycReviewController({ reviewService: mockReviewService });
    const req = { adminInfo: { id: "admin-123" }, body: { id: validId, verificationStatus: "approved" } };
    const res = createMockResponse();

    await controller.updateBusOwnerKyc(req, res);
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, "Internal Server Error!");
  });
});
