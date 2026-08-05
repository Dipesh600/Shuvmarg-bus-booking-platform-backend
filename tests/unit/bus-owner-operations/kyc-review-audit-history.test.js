"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createKycReviewService } = require("../../../src/modules/bus-owner/kyc-review/kyc-review.service");

test("kyc-review-audit-history unit tests", async (t) => {
  const fixedDate = new Date("2026-08-05T12:00:00Z");
  const validOwnerId = "64f000000000000000000001";
  const validUserId = "64f000000000000000000002";
  const validAdminId = "64f000000000000000000099";

  const activeAdmin = { _id: validAdminId, adminId: "SUMA-ADM-001", role: "ADMIN", isActive: true, email: "admin@a.com" };
  const pendingOwner = { _id: validOwnerId, user: validUserId, verificationStatus: "pending", kycAuditHistory: [] };

  function makeDeps(overrides = {}) {
    let updatePayload = null;
    const deps = {
      Admin: { findById: () => ({ lean: async () => activeAdmin }) },
      BusOwner: {
        findOne: async () => pendingOwner,
        findOneAndUpdate: async (q, u) => {
          updatePayload = u;
          return { ...pendingOwner, verificationStatus: q.verificationStatus === "pending" ? "approved" : "rejected" };
        },
      },
      User: { findById: () => ({ lean: async () => ({ _id: validUserId }) }), findByIdAndUpdate: async () => ({ _id: validUserId }) },
      applyDocumentVerdicts: (owner, body) => {
        if (body.taxRegistration) {
          owner.taxRegistration = { documentUrls: ["tax.pdf"], verified: body.taxRegistration.verified, rejectionReason: body.taxRegistration.rejectionReason };
        }
      },
      invalidDocuments: () => [{ field: "taxRegistration", label: "TAX Registration Document" }],
      clock: () => fixedDate,
      ...overrides,
    };
    return { deps, getPayload: () => updatePayload };
  }

  await t.test("approval appends KYC_APPROVED atomically with matching timestamps and reviewer ObjectId", async () => {
    const { deps, getPayload } = makeDeps();
    const service = createKycReviewService(deps);

    await service.reviewKyc({ id: validOwnerId, verificationStatus: "approved" }, { adminId: validAdminId, tokenRole: "ADMIN" });
    const payload = getPayload();

    assert.ok(payload.$push && payload.$push.kycAuditHistory, "Must include $push for kycAuditHistory");
    const event = payload.$push.kycAuditHistory;
    assert.equal(event.eventType, "KYC_APPROVED");
    assert.equal(event.actorType, "ADMIN");
    assert.equal(event.actorId, validAdminId);
    assert.notEqual(event.actorId, "SUMA-ADM-001", "Must store ObjectId, never human adminId string");
    assert.equal(event.fromStatus, "pending");
    assert.equal(event.toStatus, "approved");
    assert.equal(event.occurredAt.toISOString(), payload.$set["kycReview.reviewedAt"].toISOString(), "reviewedAt and occurredAt must match");
    assert.deepEqual(event.metadata, { invalidDocumentTypes: [], reasonProvided: false });
  });

  await t.test("rejection derives invalid canonical document section names pre-write, ignoring notification labels", async () => {
    const { deps, getPayload } = makeDeps();
    const service = createKycReviewService(deps);

    await service.reviewKyc(
      { id: validOwnerId, verificationStatus: "rejected", rejectionReason: "Tax invalid", taxRegistration: { verified: false, rejectionReason: "Bad tax doc" } },
      { adminId: validAdminId, tokenRole: "ADMIN" }
    );
    const payload = getPayload();
    const event = payload.$push.kycAuditHistory;

    assert.equal(event.eventType, "KYC_REJECTED");
    assert.deepEqual(event.metadata.invalidDocumentTypes, ["taxRegistration"], "Must store canonical section name, not notification label");
    assert.equal(event.metadata.reasonProvided, true);
  });

  await t.test("concurrent review where findOneAndUpdate loses appends no audit event", async () => {
    let updateCalled = false;
    const { deps } = makeDeps({
      BusOwner: {
        findOne: async () => pendingOwner,
        findOneAndUpdate: async () => { updateCalled = true; return null; },
      },
    });
    const service = createKycReviewService(deps);

    await assert.rejects(
      async () => service.reviewKyc({ id: validOwnerId, verificationStatus: "approved" }, { adminId: validAdminId, tokenRole: "ADMIN" }),
      (err) => err.code === "KYC_REVIEW_INVALID_TRANSITION" && err.statusCode === 409
    );
    assert.equal(updateCalled, true);
  });
});
