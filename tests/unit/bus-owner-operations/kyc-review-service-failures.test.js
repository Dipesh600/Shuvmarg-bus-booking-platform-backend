"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createKycReviewService } = require("../../../src/modules/bus-owner/kyc-review/kyc-review.service");

test("kyc-review-service failure tests", async (t) => {
  await t.test("missing reviewer identity returns HTTP 401", async () => {
    const service = createKycReviewService({ BusOwner: {}, User: {} });
    await assert.rejects(
      async () => service.reviewKyc({ id: "64f000000000000000000001", verificationStatus: "approved" }, null),
      (err) => err.code === "KYC_REVIEW_UNAUTHORIZED" && err.statusCode === 401
    );
  });

  await t.test("missing owner returns HTTP 404", async () => {
    const mockBusOwnerModel = { findOne: async () => null };
    const service = createKycReviewService({ BusOwner: mockBusOwnerModel, User: {} });
    await assert.rejects(
      async () => service.reviewKyc({ id: "64f000000000000000000001", verificationStatus: "approved" }, "admin1"),
      (err) => err.code === "KYC_REVIEW_NOT_FOUND" && err.statusCode === 404
    );
  });

  await t.test("already approved or rejected owner returns HTTP 409", async () => {
    const mockApprovedOwner = { _id: "64f000000000000000000001", verificationStatus: "approved" };
    const mockBusOwnerModel = { findOne: async () => mockApprovedOwner };
    const service = createKycReviewService({ BusOwner: mockBusOwnerModel, User: {} });

    await assert.rejects(
      async () => service.reviewKyc({ id: "64f000000000000000000001", verificationStatus: "rejected", rejectionReason: "Tax doc invalid" }, "admin1"),
      (err) => err.code === "KYC_REVIEW_INVALID_TRANSITION" && err.statusCode === 409
    );
  });

  await t.test("missing or whitespace rejection reason returns HTTP 400", async () => {
    const mockPendingOwner = { _id: "64f000000000000000000001", verificationStatus: "pending" };
    const mockBusOwnerModel = { findOne: async () => mockPendingOwner };
    const service = createKycReviewService({ BusOwner: mockBusOwnerModel, User: {} });

    await assert.rejects(
      async () => service.reviewKyc({ id: "64f000000000000000000001", verificationStatus: "rejected", rejectionReason: "   " }, "admin1"),
      (err) => err.code === "KYC_REVIEW_REASON_REQUIRED" && err.statusCode === 400
    );
  });

  await t.test("concurrent review where atomic findOneAndUpdate returns null throws HTTP 409", async () => {
    const mockPendingOwner = { _id: "64f000000000000000000001", verificationStatus: "pending" };
    const mockBusOwnerModel = {
      findOne: async () => mockPendingOwner,
      findOneAndUpdate: async () => null,
    };
    const service = createKycReviewService({ BusOwner: mockBusOwnerModel, User: {} });

    await assert.rejects(
      async () => service.reviewKyc({ id: "64f000000000000000000001", verificationStatus: "approved" }, "admin1"),
      (err) => err.code === "KYC_REVIEW_INVALID_TRANSITION" && err.statusCode === 409
    );
  });
});
