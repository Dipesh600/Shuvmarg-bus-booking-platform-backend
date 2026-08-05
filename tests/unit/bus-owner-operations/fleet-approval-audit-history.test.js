"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildFleetApprovalAuditEvent } = require("../../../src/modules/admin/fleet-management/fleet-approval-audit.builder");

test("fleet-approval-audit-history unit tests", async (t) => {
  const validAdminId = "64f000000000000000000099";
  const fixedDate = new Date("2026-08-05T12:00:00Z");

  await t.test("builds accurate FLEET_APPROVED audit event with empty metadata", () => {
    const event = buildFleetApprovalAuditEvent({
      decision: "APPROVED",
      actorId: validAdminId,
      occurredAt: fixedDate,
    });

    assert.equal(event.eventType, "FLEET_APPROVED");
    assert.equal(event.actorType, "ADMIN");
    assert.equal(event.actorId, validAdminId);
    assert.equal(event.fromStatus, "PENDING");
    assert.equal(event.toStatus, "APPROVED");
    assert.equal(event.occurredAt, fixedDate);
    assert.deepEqual(event.metadata, {});
  });

  await t.test("builds accurate FLEET_REJECTED audit event with rejectionReason metadata", () => {
    const event = buildFleetApprovalAuditEvent({
      decision: "REJECTED",
      actorId: validAdminId,
      occurredAt: fixedDate,
      rejectionReason: "Route permit expired",
    });

    assert.equal(event.eventType, "FLEET_REJECTED");
    assert.equal(event.actorType, "ADMIN");
    assert.equal(event.actorId, validAdminId);
    assert.equal(event.fromStatus, "PENDING");
    assert.equal(event.toStatus, "REJECTED");
    assert.equal(event.occurredAt, fixedDate);
    assert.deepEqual(event.metadata, { rejectionReason: "Route permit expired" });
  });

  await t.test("rejects invalid date or missing actorId", () => {
    assert.throws(
      () => buildFleetApprovalAuditEvent({ decision: "APPROVED", actorId: null, occurredAt: fixedDate }),
      (err) => err.code === "FLEET_APPROVAL_ACTOR_REQUIRED"
    );
    assert.throws(
      () => buildFleetApprovalAuditEvent({ decision: "APPROVED", actorId: validAdminId, occurredAt: "invalid" }),
      (err) => err.code === "FLEET_APPROVAL_DATE_INVALID"
    );
  });
});
