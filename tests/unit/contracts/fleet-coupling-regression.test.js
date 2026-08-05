"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { applyStatus } = require("../../../src/modules/admin/fleet-management/fleet-status.policy");

test("fleet approval and operational status coupling regression tests", async (t) => {
  await t.test("approving a fleet sets approvalStatus APPROVED and operational status ACTIVE", () => {
    const bus = { busName: "Volvo B11R", busNumber: "BA 1 PA 1234", approvalStatus: "PENDING", status: "INACTIVE" };
    const updated = applyStatus(bus, "APPROVED", null);

    assert.equal(updated.approvalStatus, "APPROVED");
    assert.equal(updated.status, "ACTIVE");
    assert.ok(updated.approvedAt instanceof Date);
    assert.equal(updated.rejectionReason, null);
  });

  await t.test("rejecting a fleet sets approvalStatus REJECTED and does not map operational status to REJECTED", () => {
    const bus = { busName: "Volvo B11R", busNumber: "BA 1 PA 1234", approvalStatus: "PENDING", status: "INACTIVE" };
    const updated = applyStatus(bus, "REJECTED", "Expired insurance");

    assert.equal(updated.approvalStatus, "REJECTED");
    assert.equal(updated.status, "INACTIVE");
    assert.ok(updated.rejectedAt instanceof Date);
    assert.equal(updated.rejectionReason, "Expired insurance");
  });
});
