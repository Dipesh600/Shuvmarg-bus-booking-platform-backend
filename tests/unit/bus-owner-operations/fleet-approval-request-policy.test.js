"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { validateFleetStatusRequest } = require("../../../src/modules/admin/fleet-management/fleet-status-request.policy");

test("fleet-approval-request-policy unit tests", async (t) => {
  const validObjectId = "64f000000000000000000002";

  await t.test("accepts valid APPROVED request without rejectionReason", () => {
    const result = validateFleetStatusRequest({ fleetId: validObjectId, status: "APPROVED" });
    assert.deepEqual(result, { fleetId: validObjectId, decision: "APPROVED", rejectionReason: null });
  });

  await t.test("accepts valid REJECTED request with trimmed rejectionReason", () => {
    const result = validateFleetStatusRequest({ fleetId: validObjectId, status: "REJECTED", rejectionReason: "  Document signature missing  " });
    assert.deepEqual(result, { fleetId: validObjectId, decision: "REJECTED", rejectionReason: "Document signature missing" });
  });

  await t.test("accepts validated document review decisions", () => {
    const result = validateFleetStatusRequest({
      fleetId: validObjectId,
      status: "REJECTED",
      rejectionReason: "Document issues found",
      documentReviews: {
        fleetImages: { status: "approved" },
        insurance: { status: "rejected", reason: "Policy number does not match." },
      },
    });
    assert.deepEqual(result.documentReviews, {
      fleetImages: { status: "approved", reason: null },
      insurance: { status: "rejected", reason: "Policy number does not match." },
    });
  });

  await t.test("rejects missing or invalid fleetId", () => {
    assert.throws(() => validateFleetStatusRequest({ status: "APPROVED" }), (err) => err.code === "FLEET_STATUS_FLEET_ID_REQUIRED");
    assert.throws(() => validateFleetStatusRequest({ fleetId: "SUV-MARG-FLEET-ABC-001", status: "APPROVED" }), (err) => err.code === "FLEET_STATUS_INVALID_ID");
    assert.throws(() => validateFleetStatusRequest({ fleetId: 12345, status: "APPROVED" }), (err) => err.code === "FLEET_STATUS_INVALID_ID");
  });

  await t.test("rejects missing or unknown status", () => {
    assert.throws(() => validateFleetStatusRequest({ fleetId: validObjectId }), (err) => err.code === "FLEET_STATUS_INVALID_STATUS");
    assert.throws(() => validateFleetStatusRequest({ fleetId: validObjectId, status: "PENDING" }), (err) => err.code === "FLEET_STATUS_INVALID_STATUS");
  });

  await t.test("rejects unknown request body fields", () => {
    for (const field of ["approvedBy", "approvedAt", "rejectedBy", "rejectedAt", "statusOperational", "approvalAuditHistory", "ownerId"]) {
      assert.throws(() => validateFleetStatusRequest({ fleetId: validObjectId, status: "APPROVED", [field]: "hack" }), (err) => err.code === "FLEET_STATUS_UNKNOWN_FIELD" && err.field === field);
    }
  });

  await t.test("rejects invalid document review decisions", () => {
    assert.throws(
      () => validateFleetStatusRequest({ fleetId: validObjectId, status: "APPROVED", documentReviews: "hack" }),
      (err) => err.code === "FLEET_STATUS_INVALID_DOCUMENT_REVIEWS"
    );
    assert.throws(
      () => validateFleetStatusRequest({ fleetId: validObjectId, status: "APPROVED", documentReviews: { fakeSlot: { status: "approved" } } }),
      (err) => err.code === "FLEET_STATUS_INVALID_DOCUMENT_REVIEWS"
    );
    assert.throws(
      () => validateFleetStatusRequest({ fleetId: validObjectId, status: "APPROVED", documentReviews: { insurance: { status: "rejected" } } }),
      (err) => err.code === "FLEET_STATUS_INVALID_DOCUMENT_REVIEWS"
    );
  });

  await t.test("rejects rejectionReason provided for APPROVED status", () => {
    assert.throws(() => validateFleetStatusRequest({ fleetId: validObjectId, status: "APPROVED", rejectionReason: "anything" }), (err) => err.code === "FLEET_APPROVAL_REASON_NOT_ALLOWED");
    assert.throws(() => validateFleetStatusRequest({ fleetId: validObjectId, status: "APPROVED", rejectionReason: "   " }), (err) => err.code === "FLEET_APPROVAL_REASON_NOT_ALLOWED");
  });

  await t.test("rejects missing, empty, or out-of-bounds rejectionReason for REJECTED status", () => {
    assert.throws(() => validateFleetStatusRequest({ fleetId: validObjectId, status: "REJECTED" }), (err) => err.code === "FLEET_STATUS_INVALID_REJECTION_REASON");
    assert.throws(() => validateFleetStatusRequest({ fleetId: validObjectId, status: "REJECTED", rejectionReason: "   " }), (err) => err.code === "FLEET_STATUS_INVALID_REJECTION_REASON");
    assert.throws(() => validateFleetStatusRequest({ fleetId: validObjectId, status: "REJECTED", rejectionReason: "Tiny" }), (err) => err.code === "FLEET_STATUS_INVALID_REJECTION_REASON");
    assert.throws(() => validateFleetStatusRequest({ fleetId: validObjectId, status: "REJECTED", rejectionReason: "A".repeat(501) }), (err) => err.code === "FLEET_STATUS_INVALID_REJECTION_REASON");
  });
});
