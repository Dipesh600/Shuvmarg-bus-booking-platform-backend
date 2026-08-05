"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getKycReviewerActor,
  assertCanReviewBusOwnerKyc,
} = require("../../../src/modules/bus-owner/kyc-review/kyc-review-actor.policy");

test("kyc-review-actor-policy unit tests", async (t) => {
  await t.test("getKycReviewerActor extracts adminId and tokenRole from req.adminInfo", () => {
    const req = {
      adminInfo: { id: "admin-123", role: "ADMIN" },
      body: { reviewedBy: "hacker", role: "SUPER_ADMIN" },
    };
    const actor = getKycReviewerActor(req);
    assert.deepEqual(actor, { adminId: "admin-123", tokenRole: "ADMIN" });
  });

  await t.test("getKycReviewerActor throws 401 when req.adminInfo is missing", () => {
    assert.throws(
      () => getKycReviewerActor({ body: { adminId: "admin-123" } }),
      (err) => err.code === "KYC_REVIEW_UNAUTHORIZED" && err.statusCode === 401
    );
  });

  await t.test("assertCanReviewBusOwnerKyc throws 401 when reviewer is missing", () => {
    assert.throws(
      () => assertCanReviewBusOwnerKyc({ reviewer: null, tokenRole: "ADMIN" }),
      (err) => err.code === "KYC_REVIEW_UNAUTHORIZED" && err.statusCode === 401
    );
  });

  await t.test("assertCanReviewBusOwnerKyc throws 403 when reviewer is inactive", () => {
    const reviewer = { role: "ADMIN", isActive: false };
    assert.throws(
      () => assertCanReviewBusOwnerKyc({ reviewer, tokenRole: "ADMIN" }),
      (err) => err.code === "KYC_REVIEW_FORBIDDEN" && err.statusCode === 403
    );
  });

  await t.test("assertCanReviewBusOwnerKyc throws 403 when reviewer account is locked", () => {
    const reviewer = { role: "ADMIN", isActive: true, accountLocked: true };
    assert.throws(
      () => assertCanReviewBusOwnerKyc({ reviewer, tokenRole: "ADMIN" }),
      (err) => err.code === "KYC_REVIEW_FORBIDDEN" && err.statusCode === 403
    );
  });

  await t.test("assertCanReviewBusOwnerKyc throws 403 for unauthorized role", () => {
    const reviewer = { role: "PASSENGER", isActive: true };
    assert.throws(
      () => assertCanReviewBusOwnerKyc({ reviewer, tokenRole: "PASSENGER" }),
      (err) => err.code === "KYC_REVIEW_FORBIDDEN" && err.statusCode === 403
    );
  });

  await t.test("assertCanReviewBusOwnerKyc throws 403 on token role mismatch", () => {
    const reviewer = { role: "SUPER_ADMIN", isActive: true };
    assert.throws(
      () => assertCanReviewBusOwnerKyc({ reviewer, tokenRole: "SUB_ADMIN" }),
      (err) => err.code === "KYC_REVIEW_FORBIDDEN" && err.statusCode === 403
    );
  });

  await t.test("assertCanReviewBusOwnerKyc passes for SUPER_ADMIN, ADMIN, SUB_ADMIN", () => {
    for (const role of ["SUPER_ADMIN", "ADMIN", "SUB_ADMIN"]) {
      const reviewer = { role, isActive: true };
      assert.doesNotThrow(() => assertCanReviewBusOwnerKyc({ reviewer, tokenRole: role }));
    }
  });
});
