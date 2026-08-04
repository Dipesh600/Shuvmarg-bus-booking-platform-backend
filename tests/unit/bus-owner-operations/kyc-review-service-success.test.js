"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createKycReviewService } = require("../../../src/modules/bus-owner/kyc-review/kyc-review.service");

test("kyc-review-service success tests", async (t) => {
  const fixedDate = new Date("2026-08-04T12:00:00Z");
  const mockAdmin = { _id: "64f000000000000000000099", role: "ADMIN", isActive: true, email: "admin@shuvmarg.com" };
  const mockAdminModel = { findById: () => ({ lean: async () => mockAdmin }) };

  await t.test("pending -> approved updates state, user sync, review metadata, and ownerIdentity approval verdict", async () => {
    let atomicQuery = null;
    let atomicUpdate = null;
    let userSyncCall = null;

    const mockOwner = {
      _id: "64f000000000000000000001",
      user: "64f000000000000000000002",
      verificationStatus: "pending",
      companyRegistration: { verified: false },
      ownerIdentity: { verified: false, rejectionReason: null },
    };

    const mockBusOwnerModel = {
      findOne: async () => mockOwner,
      findOneAndUpdate: async (query, update) => {
        atomicQuery = query;
        atomicUpdate = update;
        return {
          ...mockOwner,
          ...update.$set,
          verificationStatus: "approved",
          rejectionReason: null,
          kycReview: {
            reviewedBy: update.$set["kycReview.reviewedBy"],
            reviewedAt: update.$set["kycReview.reviewedAt"],
          },
        };
      },
    };

    const mockUserModel = {
      findByIdAndUpdate: async (userId, update) => {
        userSyncCall = { userId, update };
      },
      findById: () => ({ lean: async () => ({ _id: "64f000000000000000000002", email: "owner@test.com" }) }),
    };

    const service = createKycReviewService({
      Admin: mockAdminModel,
      BusOwner: mockBusOwnerModel,
      User: mockUserModel,
      applyDocumentVerdicts: (owner) => {
        owner.companyRegistration.verified = true;
        owner.ownerIdentity.verified = true;
        owner.ownerIdentity.rejectionReason = null;
      },
      invalidDocuments: () => [],
      clock: () => fixedDate,
    });

    const result = await service.reviewKyc(
      { id: "64f000000000000000000001", verificationStatus: "approved" },
      "64f000000000000000000099"
    );

    assert.equal(atomicQuery.verificationStatus, "pending");
    assert.equal(atomicUpdate.$set.verificationStatus, "approved");
    assert.equal(atomicUpdate.$set.rejectionReason, null);
    assert.equal(atomicUpdate.$set["ownerIdentity.verified"], true);
    assert.equal(atomicUpdate.$set["ownerIdentity.rejectionReason"], null);
    assert.equal(atomicUpdate.$set["kycReview.reviewedBy"], "64f000000000000000000099");
    assert.equal(atomicUpdate.$set["kycReview.reviewedAt"], fixedDate);
    assert.deepEqual(userSyncCall.update.$set, { status: "active", isVerified: true });
    assert.equal(result.status, "approved");
    assert.equal(result.data.verificationStatus, "approved");
  });

  await t.test("pending -> rejected validates trimmed reason, persists ownerIdentity rejection verdict, and sets user.isVerified = false", async () => {
    let atomicUpdate = null;
    let userSyncCall = null;
    const mockOwner = {
      _id: "64f000000000000000000001",
      user: "64f000000000000000000002",
      verificationStatus: "pending",
      ownerIdentity: { verified: false, rejectionReason: null },
    };

    const mockBusOwnerModel = {
      findOne: async () => mockOwner,
      findOneAndUpdate: async (query, update) => {
        atomicUpdate = update;
        return {
          ...mockOwner,
          ...update.$set,
          verificationStatus: "rejected",
          rejectionReason: update.$set.rejectionReason,
          kycReview: {
            reviewedBy: update.$set["kycReview.reviewedBy"],
            reviewedAt: update.$set["kycReview.reviewedAt"],
          },
        };
      },
    };

    const mockUserModel = {
      findByIdAndUpdate: async (userId, update) => { userSyncCall = { userId, update }; },
      findById: () => ({ lean: async () => ({ _id: "64f000000000000000000002" }) }),
    };

    const service = createKycReviewService({
      Admin: mockAdminModel,
      BusOwner: mockBusOwnerModel,
      User: mockUserModel,
      applyDocumentVerdicts: (owner) => {
        owner.ownerIdentity.verified = false;
        owner.ownerIdentity.rejectionReason = "Identity document is unreadable";
      },
      invalidDocuments: () => ["ownerIdentity"],
      clock: () => fixedDate,
    });

    const result = await service.reviewKyc(
      {
        id: "64f000000000000000000001",
        verificationStatus: "rejected",
        rejectionReason: "  Document unreadable  ",
        ownerIdentity: { verified: false, rejectionReason: "Identity document is unreadable" },
      },
      "64f000000000000000000099"
    );

    assert.equal(atomicUpdate.$set["ownerIdentity.verified"], false);
    assert.equal(atomicUpdate.$set["ownerIdentity.rejectionReason"], "Identity document is unreadable");
    assert.equal(result.data.verificationStatus, "rejected");
    assert.equal(result.data.rejectionReason, "Document unreadable");
    assert.deepEqual(userSyncCall.update.$set, { isVerified: false });
    assert.deepEqual(result.documents, ["ownerIdentity"]);
  });
});
