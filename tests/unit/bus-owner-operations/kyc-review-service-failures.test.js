"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createKycReviewService } = require("../../../src/modules/bus-owner/kyc-review/kyc-review.service");

test("kyc-review-service failure tests", async (t) => {
  const mockAdmin = { _id: "admin1", role: "ADMIN", isActive: true, email: "admin@shuvmarg.com" };
  const mockAdminModel = { findById: () => ({ lean: async () => mockAdmin }) };
  const validActor = { adminId: "admin1", tokenRole: "ADMIN" };

  await t.test("missing reviewer identity returns HTTP 401", async () => {
    const service = createKycReviewService({ Admin: mockAdminModel, BusOwner: {}, User: {} });
    await assert.rejects(
      async () => service.reviewKyc({ id: "64f000000000000000000001", verificationStatus: "approved" }, null),
      (err) => err.code === "KYC_REVIEW_UNAUTHORIZED" && err.statusCode === 401
    );
  });

  await t.test("missing owner returns HTTP 404", async () => {
    const mockBusOwnerModel = { findOne: async () => null };
    const service = createKycReviewService({ Admin: mockAdminModel, BusOwner: mockBusOwnerModel, User: {} });
    await assert.rejects(
      async () => service.reviewKyc({ id: "64f000000000000000000001", verificationStatus: "approved" }, validActor),
      (err) => err.code === "KYC_REVIEW_NOT_FOUND" && err.statusCode === 404
    );
  });

  await t.test("production reviewer cannot approve quarantined documents", async () => {
    let writeCalls = 0;
    const mockPendingOwner = {
      _id: "64f000000000000000000001",
      verificationStatus: "pending",
      kycSecurity: { malwareScanStatus: "skipped_non_production" },
    };
    const mockBusOwnerModel = {
      findOne: async () => mockPendingOwner,
      findOneAndUpdate: async () => { writeCalls += 1; },
    };
    const service = createKycReviewService({
      Admin: mockAdminModel,
      BusOwner: mockBusOwnerModel,
      User: {},
      environment: "production",
    });

    await assert.rejects(
      () => service.reviewKyc(
        { id: "64f000000000000000000001", verificationStatus: "approved" },
        validActor
      ),
      (err) => err.code === "KYC_REVIEW_SECURITY_SCAN_REQUIRED" && err.statusCode === 423
    );
    assert.equal(writeCalls, 0);
  });

  await t.test("already approved or rejected owner returns HTTP 409", async () => {
    const mockApprovedOwner = { _id: "64f000000000000000000001", verificationStatus: "approved" };
    const mockBusOwnerModel = { findOne: async () => mockApprovedOwner };
    const service = createKycReviewService({ Admin: mockAdminModel, BusOwner: mockBusOwnerModel, User: {} });

    await assert.rejects(
      async () => service.reviewKyc({ id: "64f000000000000000000001", verificationStatus: "rejected", rejectionReason: "Tax doc invalid" }, validActor),
      (err) => err.code === "KYC_REVIEW_INVALID_TRANSITION" && err.statusCode === 409
    );
  });

  await t.test("missing or whitespace rejection reason returns HTTP 400", async () => {
    const mockPendingOwner = { _id: "64f000000000000000000001", verificationStatus: "pending" };
    const mockBusOwnerModel = { findOne: async () => mockPendingOwner };
    const service = createKycReviewService({ Admin: mockAdminModel, BusOwner: mockBusOwnerModel, User: {} });

    await assert.rejects(
      async () => service.reviewKyc({ id: "64f000000000000000000001", verificationStatus: "rejected", rejectionReason: "   " }, validActor),
      (err) => err.code === "KYC_REVIEW_REASON_REQUIRED" && err.statusCode === 400
    );
  });

  await t.test("concurrent review where atomic findOneAndUpdate returns null throws HTTP 409", async () => {
    const mockPendingOwner = {
      _id: "64f000000000000000000001",
      verificationStatus: "pending",
      companyRegistration: { documentUrls: ["company.pdf"] },
      taxRegistration: { documentUrls: ["tax.pdf"] },
      ownerIdentity: { documentUrls: ["citizenship.pdf"] },
    };
    const mockBusOwnerModel = {
      findOne: async () => mockPendingOwner,
      findOneAndUpdate: async () => null,
    };
    const service = createKycReviewService({ Admin: mockAdminModel, BusOwner: mockBusOwnerModel, User: {} });

    await assert.rejects(
      async () => service.reviewKyc({ id: "64f000000000000000000001", verificationStatus: "approved" }, validActor),
      (err) => err.code === "KYC_REVIEW_INVALID_TRANSITION" && err.statusCode === 409
    );
  });

  await t.test("approval is blocked when any required business KYC document is missing", async () => {
    let writeCalls = 0;
    const mockPendingOwner = {
      _id: "64f000000000000000000001",
      verificationStatus: "pending",
      companyRegistration: { documentUrls: ["company.pdf"] },
      taxRegistration: { documentUrls: ["tax.pdf"] },
      ownerIdentity: { documentUrls: [] },
    };
    const mockBusOwnerModel = {
      findOne: async () => mockPendingOwner,
      findOneAndUpdate: async () => { writeCalls += 1; },
    };
    const service = createKycReviewService({ Admin: mockAdminModel, BusOwner: mockBusOwnerModel, User: {} });

    await assert.rejects(
      async () => service.reviewKyc({ id: "64f000000000000000000001", verificationStatus: "approved" }, validActor),
      (err) => err.code === "KYC_REVIEW_REQUIRED_DOCUMENTS_MISSING" && err.statusCode === 409
    );
    assert.equal(writeCalls, 0);
  });
});
