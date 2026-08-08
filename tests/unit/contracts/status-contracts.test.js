"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  OWNER_VERIFICATION_STATUS,
  OWNER_VERIFICATION_VALUES,
  OWNER_VERIFICATION_LABELS,
  isOwnerVerificationStatus,
  getOwnerVerificationLabel,
  FLEET_APPROVAL_STATUS,
  FLEET_APPROVAL_VALUES,
  FLEET_APPROVAL_LABELS,
  isFleetApprovalStatus,
  getFleetApprovalLabel,
  FLEET_OPERATIONAL_STATUS,
  FLEET_OPERATIONAL_VALUES,
  FLEET_OPERATIONAL_LABELS,
  isFleetOperationalStatus,
  getFleetOperationalLabel,
  DOCUMENT_REVIEW_STATUS,
  DOCUMENT_REVIEW_VALUES,
  DOCUMENT_REVIEW_LABELS,
  isDocumentReviewStatus,
  getDocumentReviewLabel,
  KYC_DOCUMENT_STATE,
  KYC_DOCUMENT_STATE_VALUES,
  KYC_DOCUMENT_STATE_LABELS,
  deriveKycDocumentState,
  isKycDocumentState,
  getKycDocumentStateLabel,
  getPublicStatusMetadata,
} = require("../../../src/contracts");

test("owner verification status contract tests", async (t) => {
  await t.test("matches schema values and provides frozen labels", () => {
    assert.deepEqual(OWNER_VERIFICATION_VALUES, ["pending", "approved", "rejected"]);
    assert.equal(isOwnerVerificationStatus("pending"), true);
    assert.equal(isOwnerVerificationStatus("UNKNOWN"), false);
    assert.equal(getOwnerVerificationLabel("pending"), "Pending Review");
    assert.equal(getOwnerVerificationLabel("invalid"), null);
    assert.throws(() => { OWNER_VERIFICATION_STATUS.PENDING = "mod"; });
  });
});

test("fleet approval and operational status contracts", async (t) => {
  await t.test("fleet approval status values match schema", () => {
    assert.deepEqual(FLEET_APPROVAL_VALUES, ["DRAFT", "PENDING", "APPROVED", "REJECTED"]);
    assert.equal(isFleetApprovalStatus("APPROVED"), true);
    assert.equal(getFleetApprovalLabel("APPROVED"), "Approved");
  });

  await t.test("fleet operational status values match schema", () => {
    assert.deepEqual(FLEET_OPERATIONAL_VALUES, ["ACTIVE", "INACTIVE", "MAINTENANCE"]);
    assert.equal(isFleetOperationalStatus("ACTIVE"), true);
    assert.equal(getFleetOperationalLabel("MAINTENANCE"), "Under Maintenance");
  });
});

test("document review and KYC derived state precedence", async (t) => {
  await t.test("document review status contract", () => {
    assert.deepEqual(DOCUMENT_REVIEW_VALUES, ["pending", "approved", "rejected"]);
    assert.equal(isDocumentReviewStatus("approved"), true);
    assert.equal(getDocumentReviewLabel("approved"), "Approved");
  });

  await t.test("KYC derived state explicit precedence", () => {
    assert.equal(deriveKycDocumentState({ present: false }), "missing");
    assert.equal(
      deriveKycDocumentState({ present: true, verified: false, rejectionReason: null }),
      "unverified"
    );
    assert.equal(
      deriveKycDocumentState({ present: true, verified: true, rejectionReason: null }),
      "verified"
    );
    assert.equal(
      deriveKycDocumentState({ present: true, verified: false, rejectionReason: "Blurry image" }),
      "rejected"
    );
    // Explicit precedence: rejectionReason takes precedence over verified true in contradictory legacy data
    assert.equal(
      deriveKycDocumentState({ present: true, verified: true, rejectionReason: "Invalid doc" }),
      "rejected"
    );
  });
});

test("public status metadata payload format", async () => {
  const metadata = getPublicStatusMetadata();
  assert.ok(Array.isArray(metadata.ownerVerification));
  assert.ok(Array.isArray(metadata.fleetApproval));
  assert.ok(Array.isArray(metadata.fleetOperational));
  assert.ok(Array.isArray(metadata.fleetDocumentReview));
  assert.ok(Array.isArray(metadata.kycDocumentState));
});
