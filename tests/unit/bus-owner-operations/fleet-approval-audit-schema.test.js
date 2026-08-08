"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const fleetApprovalAuditSchema = require("../../../models/schemas/fleet-approval-audit.schema");

const AuditModel = mongoose.model("FleetApprovalAuditTest", fleetApprovalAuditSchema);

test("fleet-approval-audit.schema validation tests", async (t) => {
  const actorId = new mongoose.Types.ObjectId();

  await t.test("FLEET_RESUBMITTED validates with BUS_OWNER and REJECTED -> PENDING", () => {
    const doc = new AuditModel({
      eventType: "FLEET_RESUBMITTED",
      actorType: "BUS_OWNER",
      actorId,
      fromStatus: "REJECTED",
      toStatus: "PENDING",
      occurredAt: new Date(),
    });
    const err = doc.validateSync();
    assert.equal(err, undefined);
  });

  await t.test("FLEET_RESUBMITTED validates with ADMIN and REJECTED -> PENDING", () => {
    const doc = new AuditModel({
      eventType: "FLEET_RESUBMITTED",
      actorType: "ADMIN",
      actorId,
      fromStatus: "REJECTED",
      toStatus: "PENDING",
      occurredAt: new Date(),
    });
    const err = doc.validateSync();
    assert.equal(err, undefined);
  });

  await t.test("FLEET_APPROVED rejects BUS_OWNER actorType", () => {
    const doc = new AuditModel({
      eventType: "FLEET_APPROVED",
      actorType: "BUS_OWNER",
      actorId,
      fromStatus: "PENDING",
      toStatus: "APPROVED",
      occurredAt: new Date(),
    });
    const err = doc.validateSync();
    assert.ok(err);
    assert.match(err.message, /Invalid audit event combination/);
  });

  await t.test("FLEET_APPROVED rejects REJECTED as fromStatus", () => {
    const doc = new AuditModel({
      eventType: "FLEET_APPROVED",
      actorType: "ADMIN",
      actorId,
      fromStatus: "REJECTED",
      toStatus: "APPROVED",
      occurredAt: new Date(),
    });
    const err = doc.validateSync();
    assert.ok(err);
    assert.match(err.message, /Invalid audit event combination/);
  });

  await t.test("FLEET_RESUBMITTED rejects PENDING -> PENDING transition", () => {
    const doc = new AuditModel({
      eventType: "FLEET_RESUBMITTED",
      actorType: "BUS_OWNER",
      actorId,
      fromStatus: "PENDING",
      toStatus: "PENDING",
      occurredAt: new Date(),
    });
    const err = doc.validateSync();
    assert.ok(err);
    assert.match(err.message, /Invalid audit event combination/);
  });
});
