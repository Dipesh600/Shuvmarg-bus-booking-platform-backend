"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { validateFleetStatusRequest } = require("../../../src/modules/admin/fleet-management/fleet-status-request.policy");
const { approvedFleetReviews, rejectedFleetReviews } = require("../../helpers/fleet-review-fixtures");

test("fleet-approval-request-policy unit tests", async (t) => {
  const validObjectId = "64f000000000000000000002";

  await t.test("accepts valid APPROVED request without rejectionReason", () => {
    const reviews = approvedFleetReviews();
    const result = validateFleetStatusRequest({ fleetId: validObjectId, status: "APPROVED", reviews });
    assert.deepEqual(result, { fleetId: validObjectId, decision: "APPROVED", rejectionReason: null, reviews });
  });

  await t.test("accepts valid REJECTED request with trimmed rejectionReason", () => {
    const reviews = rejectedFleetReviews("insurance", "Document signature missing");
    const result = validateFleetStatusRequest({ fleetId: validObjectId, status: "REJECTED", rejectionReason: "  Document signature missing  ", reviews });
    assert.deepEqual(result, { fleetId: validObjectId, decision: "REJECTED", rejectionReason: "Document signature missing", reviews });
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
    for (const field of ["approvedBy", "approvedAt", "rejectedBy", "rejectedAt", "statusOperational", "approvalAuditHistory", "ownerId", "documentReviews"]) {
      assert.throws(() => validateFleetStatusRequest({ fleetId: validObjectId, status: "APPROVED", [field]: "hack" }), (err) => err.code === "FLEET_STATUS_UNKNOWN_FIELD" && err.field === field);
    }
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

  await t.test("requires a decision for every review item", () => {
    const reviews = approvedFleetReviews();
    delete reviews.routeSetup;
    assert.throws(
      () => validateFleetStatusRequest({ fleetId: validObjectId, status: "APPROVED", reviews }),
      (err) => err.code === "FLEET_REVIEW_INCOMPLETE" && err.field === "reviews.routeSetup"
    );
  });

  await t.test("cannot approve with a rejected item or request changes with none", () => {
    assert.throws(
      () => validateFleetStatusRequest({ fleetId: validObjectId, status: "APPROVED", reviews: rejectedFleetReviews() }),
      (err) => err.code === "FLEET_REVIEW_HAS_REJECTIONS"
    );
    assert.throws(
      () => validateFleetStatusRequest({ fleetId: validObjectId, status: "REJECTED", rejectionReason: "Please correct the submission", reviews: approvedFleetReviews() }),
      (err) => err.code === "FLEET_REVIEW_REJECTION_REQUIRED"
    );
  });
});
