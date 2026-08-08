"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildAdminOwnerProfileAuditEvent } = require("../../../src/modules/admin/bus-owner-management/admin-owner-profile-audit.builder");

test("admin-owner-profile-audit unit tests", async (t) => {
  const validAdminId = "64f000000000000000000099";
  const fixedDate = new Date("2026-08-05T12:00:00Z");

  await t.test("builds accurate ADMIN_PROFILE_UPDATED audit event with sorted changedFields", () => {
    const event = buildAdminOwnerProfileAuditEvent({
      actorId: validAdminId,
      occurredAt: fixedDate,
      reason: "Updating bank account details per admin review",
      ownerVerificationStatus: "pending",
      changedFields: ["bankName", "accountNumber", "bankName"], // includes duplicate
    });

    assert.equal(event.eventType, "ADMIN_PROFILE_UPDATED");
    assert.equal(event.actorType, "ADMIN");
    assert.equal(event.actorId, validAdminId);
    assert.equal(event.occurredAt, fixedDate);
    assert.equal(event.reason, "Updating bank account details per admin review");
    assert.equal(event.ownerVerificationStatus, "pending");
    assert.deepEqual(event.changedFields, ["accountNumber", "bankName"]);

    assert.equal(event.oldValue, undefined);
    assert.equal(event.newValue, undefined);
    assert.equal(event.accountNumber, undefined);
  });

  await t.test("rejects invalid date, missing actorId, empty fields, or unknown fields", () => {
    assert.throws(() => buildAdminOwnerProfileAuditEvent({ actorId: null, occurredAt: fixedDate, reason: "valid", ownerVerificationStatus: "pending", changedFields: ["name"] }), (err) => err.code === "OWNER_PROFILE_AUDIT_ACTOR_REQUIRED");
    assert.throws(() => buildAdminOwnerProfileAuditEvent({ actorId: validAdminId, occurredAt: "invalid", reason: "valid", ownerVerificationStatus: "pending", changedFields: ["name"] }), (err) => err.code === "OWNER_PROFILE_AUDIT_DATE_INVALID");
    assert.throws(() => buildAdminOwnerProfileAuditEvent({ actorId: validAdminId, occurredAt: fixedDate, reason: "valid", ownerVerificationStatus: "pending", changedFields: [] }), (err) => err.code === "OWNER_PROFILE_AUDIT_FIELDS_REQUIRED");
    assert.throws(() => buildAdminOwnerProfileAuditEvent({ actorId: validAdminId, occurredAt: fixedDate, reason: "valid", ownerVerificationStatus: "pending", changedFields: ["taxRegistration.panNumber"] }), (err) => err.code === "OWNER_PROFILE_AUDIT_FIELD_INVALID");
  });
});
