"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createKycReviewService } = require("../../../src/modules/bus-owner/kyc-review/kyc-review.service");

test("kyc-review-reviewer-authorization zero-side-effect tests", async (t) => {
  const validOwnerId = "64f000000000000000000001";
  const validUserId = "64f000000000000000000002";
  const validAdminId = "64f000000000000000000099";

  const activeAdmin = { _id: validAdminId, role: "ADMIN", isActive: true, accountLocked: false, email: "admin@a.com" };
  const pendingOwner = { _id: validOwnerId, user: validUserId, verificationStatus: "pending" };
  const ownerUser = { _id: validUserId, email: "owner@o.com", phone: "9800000000" };

  function makeMockDeps(overrides = {}) {
    let updateCalled = false;
    let syncCalled = false;

    const deps = {
      Admin: { findById: () => ({ lean: async () => overrides.reviewer !== undefined ? overrides.reviewer : activeAdmin }) },
      BusOwner: {
        findOne: async () => pendingOwner,
        findOneAndUpdate: async () => { updateCalled = true; return { ...pendingOwner, verificationStatus: "approved" }; },
      },
      User: {
        findById: () => ({ lean: async () => ownerUser }),
        findByIdAndUpdate: async () => { syncCalled = true; },
      },
      applyDocumentVerdicts: () => {},
      invalidDocuments: () => [],
      ...overrides,
    };

    return { deps, wasUpdateCalled: () => updateCalled, wasSyncCalled: () => syncCalled };
  }

  await t.test("missing admin identity in DB returns 401 with zero side effects", async () => {
    const { deps, wasUpdateCalled, wasSyncCalled } = makeMockDeps({ reviewer: null });
    const service = createKycReviewService(deps);

    await assert.rejects(
      async () => service.reviewKyc({ id: validOwnerId, verificationStatus: "approved" }, { adminId: validAdminId, tokenRole: "ADMIN" }),
      (err) => err.code === "KYC_REVIEW_UNAUTHORIZED" && err.statusCode === 401
    );
    assert.equal(wasUpdateCalled(), false, "findOneAndUpdate must not be called");
    assert.equal(wasSyncCalled(), false, "User sync must not be called");
  });

  await t.test("inactive admin in DB returns 403 with zero side effects", async () => {
    const inactiveAdmin = { ...activeAdmin, isActive: false };
    const { deps, wasUpdateCalled, wasSyncCalled } = makeMockDeps({ reviewer: inactiveAdmin });
    const service = createKycReviewService(deps);

    await assert.rejects(
      async () => service.reviewKyc({ id: validOwnerId, verificationStatus: "approved" }, { adminId: validAdminId, tokenRole: "ADMIN" }),
      (err) => err.code === "KYC_REVIEW_FORBIDDEN" && err.statusCode === 403
    );
    assert.equal(wasUpdateCalled(), false);
    assert.equal(wasSyncCalled(), false);
  });

  await t.test("role mismatch returns 403 with zero side effects", async () => {
    const { deps, wasUpdateCalled } = makeMockDeps();
    const service = createKycReviewService(deps);

    await assert.rejects(
      async () => service.reviewKyc({ id: validOwnerId, verificationStatus: "approved" }, { adminId: validAdminId, tokenRole: "SUB_ADMIN" }),
      (err) => err.code === "KYC_REVIEW_FORBIDDEN" && err.statusCode === 403
    );
    assert.equal(wasUpdateCalled(), false);
  });

  await t.test("self-approval matching email returns 409 with zero side effects", async () => {
    const conflictedAdmin = { ...activeAdmin, email: "owner@o.com" };
    const { deps, wasUpdateCalled } = makeMockDeps({ reviewer: conflictedAdmin });
    const service = createKycReviewService(deps);

    await assert.rejects(
      async () => service.reviewKyc({ id: validOwnerId, verificationStatus: "approved" }, { adminId: validAdminId, tokenRole: "ADMIN" }),
      (err) => err.code === "KYC_REVIEW_SELF_APPROVAL_FORBIDDEN" && err.statusCode === 409
    );
    assert.equal(wasUpdateCalled(), false);
  });
});
