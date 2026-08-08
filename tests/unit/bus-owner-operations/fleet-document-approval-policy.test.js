"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const policy = require("../../../src/modules/fleet/document-lifecycle/fleet-document-approval.policy");

test("fleet-document-approval-policy unit tests", async (t) => {
  await t.test("APPROVED fleet rejects replacement of legal slot with 409 APPROVED_FLEET_DOCUMENT_IMMUTABLE", () => {
    const fleet = { approvalStatus: "APPROVED" };
    assert.throws(
      () => policy.enforceUploadPolicy(fleet, "insurance"),
      (err) => err.statusCode === 409 && err.code === "APPROVED_FLEET_DOCUMENT_IMMUTABLE"
    );
  });

  await t.test("APPROVED fleet rejects replacement of fleetImages with 409 APPROVED_FLEET_DOCUMENT_IMMUTABLE", () => {
    const fleet = { approvalStatus: "APPROVED" };
    assert.throws(
      () => policy.enforceUploadPolicy(fleet, "fleetImages"),
      (err) => err.statusCode === 409 && err.code === "APPROVED_FLEET_DOCUMENT_IMMUTABLE"
    );
  });

  await t.test("REJECTED fleet rejects replacement of already approved slot", () => {
    const fleet = {
      approvalStatus: "REJECTED",
      documentReviews: { insurance: { status: "approved" } },
    };
    assert.throws(
      () => policy.enforceUploadPolicy(fleet, "insurance"),
      (err) => err.statusCode === 409 && err.code === "FLEET_DOCUMENT_SLOT_NOT_REJECTED"
    );
  });

  await t.test("REJECTED fleet allows replacement of rejected slot", () => {
    const fleet = {
      approvalStatus: "REJECTED",
      documentReviews: { insurance: { status: "rejected" } },
    };
    assert.doesNotThrow(() => policy.enforceUploadPolicy(fleet, "insurance"));
  });

  await t.test("PENDING fleet rejects replacement of any slot with 403 FLEET_DOCUMENT_FORBIDDEN", () => {
    const fleet = { approvalStatus: "PENDING" };
    assert.throws(
      () => policy.enforceUploadPolicy(fleet, "fitnessCert"),
      (err) => err.statusCode === 403 && err.code === "FLEET_DOCUMENT_FORBIDDEN"
    );
  });

  await t.test("classifyAction identifies UPLOADED vs REPLACED vs RESUBMITTED", () => {
    assert.equal(policy.classifyAction({ approvalStatus: "PENDING" }, "fitnessCert"), "UPLOADED");
    assert.equal(
      policy.classifyAction({ approvalStatus: "PENDING", fleetDocuments: { fitnessCert: { objectKey: "k" } } }, "fitnessCert"),
      "REPLACED"
    );
    assert.equal(policy.classifyAction({ approvalStatus: "REJECTED" }, "fitnessCert"), "RESUBMITTED");
  });
});
