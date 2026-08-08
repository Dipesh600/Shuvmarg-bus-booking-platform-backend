"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createKycReviewController } = require("../../../src/modules/bus-owner/kyc-review/kyc-review.controller");

function createMockResponse() {
  const res = {
    statusCode: null,
    body: null,
    status(code) { res.statusCode = code; return res; },
    json(data) { res.body = data; return res; },
  };
  return res;
}

test("kyc-review-controller unit tests", async (t) => {
  const validId = "64f000000000000000000001";

  await t.test("PATCH /api/admin/busOwnerKycStatus route remains guarded by adminMiddleware", () => {
    const adminRoutes = fs.readFileSync(path.resolve(__dirname, "../../../routes/adminRoutes/adminRoutes.js"), "utf8");
    assert.match(
      adminRoutes,
      /router\.patch\(["']\/busOwnerKycStatus["'],\s*adminMiddleware,/,
      "PATCH /busOwnerKycStatus must use adminMiddleware"
    );
  });

  await t.test("unauthenticated request returns HTTP 401", async () => {
    const controller = createKycReviewController({ reviewService: {} });
    const req = { body: { id: validId, verificationStatus: "approved" } };
    const res = createMockResponse();

    await controller.updateBusOwnerKyc(req, res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, "Authenticated reviewer identity is required.");
  });

  await t.test("successful review triggers notifyKycResult and returns HTTP 200", async () => {
    let notifiedResult = null;
    const mockServiceResult = { data: { busOwnerId: validId, verificationStatus: "approved" } };

    const mockReviewService = {
      reviewKyc: async (body, actor) => {
        assert.equal(actor.adminId, "admin-123");
        assert.equal(actor.tokenRole, "ADMIN");
        return mockServiceResult;
      },
    };

    const controller = createKycReviewController({
      reviewService: mockReviewService,
      notifyKycResult: async (result) => { notifiedResult = result; },
    });

    const req = {
      adminInfo: { id: "admin-123", role: "ADMIN" },
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
    const req = { adminInfo: { id: "admin-456", role: "ADMIN" }, body: { id: validId, verificationStatus: "rejected" } };
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
    const req = { adminInfo: { id: "admin-123", role: "ADMIN" }, body: { id: validId, verificationStatus: "approved" } };
    const res = createMockResponse();

    await controller.updateBusOwnerKyc(req, res);
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, "Internal Server Error!");
  });
});
