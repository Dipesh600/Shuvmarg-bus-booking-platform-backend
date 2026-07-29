"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const query = require("../../src/modules/admin/fleet-management/fleet-query.policy");
const status = require("../../src/modules/admin/fleet-management/fleet-status.policy");

test("fleet query modes preserve operational precedence and scoped filters", () => {
  assert.deepEqual(
    query.buildFleetQuery({
      operational: "true",
      grounded: "true",
      approvalStatus: "REJECTED",
      brandId: "b1",
      ownerId: "o1",
    }),
    {
      setupComplete: true,
      approvalStatus: "APPROVED",
      brandId: "b1",
      ownerId: "o1",
    }
  );
  assert.deepEqual(query.buildFleetQuery({ grounded: "true" }), {
    setupComplete: false,
    approvalStatus: "APPROVED",
  });
  assert.deepEqual(query.buildFleetQuery({ approvalStatus: "PENDING" }), {
    approvalStatus: "PENDING",
  });
});

test("schedule and empty-result policies preserve exact mode behavior", () => {
  assert.equal(query.needsScheduleSummary({ operational: "true" }), true);
  assert.equal(query.needsScheduleSummary({ grounded: "true" }), true);
  assert.equal(query.needsScheduleSummary({ operational: true }), false);
  assert.equal(
    query.getEmptyFleetMessage({ operational: "true" }),
    "No buses are currently live on the network."
  );
  assert.equal(
    query.getEmptyFleetMessage({ grounded: "true" }),
    "No grounded buses found."
  );
  assert.equal(query.getEmptyFleetMessage({}), "No fleets registered yet.");
});

test("fleet status validation preserves its exact 400 contract", () => {
  assert.equal(status.validateStatus("APPROVED"), null);
  assert.equal(status.validateStatus("REJECTED"), null);
  assert.deepEqual(status.validateStatus("ACTIVE"), {
    statusCode: 400,
    body: {
      success: false,
      message: "Invalid status. Allowed values: APPROVED, REJECTED",
    },
  });
});

test("approval and rejection mutations preserve legacy field rules", () => {
  const approvedAt = new Date("2026-01-02T00:00:00Z");
  const approved = status.applyStatus(
    { rejectionReason: "old" },
    "APPROVED",
    "ignored",
    approvedAt
  );
  assert.equal(approved.approvalStatus, "APPROVED");
  assert.equal(approved.status, "ACTIVE");
  assert.equal(approved.approvedAt, approvedAt);
  assert.equal(approved.rejectionReason, null);

  const rejectedAt = new Date("2026-02-03T00:00:00Z");
  const rejected = status.applyStatus({}, "REJECTED", "", rejectedAt);
  assert.equal(rejected.approvalStatus, "REJECTED");
  assert.equal(rejected.rejectedAt, rejectedAt);
  assert.equal(rejected.rejectionReason, "No reason provided");
});
