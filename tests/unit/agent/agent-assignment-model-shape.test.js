"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const AgentAssignment = require("../../../models/agentAssignmentModel.js");

const oid = () => new mongoose.Types.ObjectId();
const minimal = () => ({ agentId: oid(), operatorId: oid(), ownerId: oid() });

test("AgentAssignment schema", async (t) => {
  await t.test("registers under the expected model name", () => {
    assert.equal(AgentAssignment.modelName, "AgentAssignment");
  });

  await t.test("requires the three parties", () => {
    const errors = new AgentAssignment({}).validateSync().errors;
    for (const path of ["agentId", "operatorId", "ownerId"]) {
      assert.ok(errors[path], `${path} must be required`);
    }
  });

  await t.test("accepts a minimal row", () => {
    assert.equal(new AgentAssignment(minimal()).validateSync(), undefined);
  });
});

test("AgentAssignment refs", async (t) => {
  const refOf = (path) => AgentAssignment.schema.path(path).options.ref;

  await t.test("point ownerId at User, not the BusOwner collection", () => {
    // OperatorBrand.ownerId and Agent.createdByOwnerId both ref "User". An owner
    // id does not point into the BusOwner collection, so "BusOwner" here would
    // make populate resolve nothing.
    assert.equal(refOf("ownerId"), "User");
    assert.equal(refOf("invitedBy"), "User");
    assert.equal(refOf("revokedBy"), "User");
  });

  await t.test("point at the names those models actually register", () => {
    assert.equal(refOf("agentId"), "Agent");
    assert.equal(refOf("operatorId"), "OperatorBrand");
    assert.equal(AgentAssignment.schema.path("allowedRouteIds").caster.options.ref, "RouteVariant");
    // Lowercase: busScheduleModel.js registers mongoose.model("busschedules").
    // "BusSchedule" would silently populate to null — the bug fixed in 24a9b9d.
    assert.equal(
      AgentAssignment.schema.path("allowedScheduleIds").caster.options.ref,
      "busschedules",
    );
  });
});

test("AgentAssignment defaults", async (t) => {
  await t.test("start a row at INVITED, because the agent must accept", () => {
    assert.equal(new AgentAssignment(minimal()).status, "INVITED");
  });

  await t.test("open all buses until the operator narrows it", () => {
    assert.equal(new AgentAssignment(minimal()).accessScope, "ALL_BUSES");
  });

  await t.test("apply the conservative permission defaults", () => {
    const { permissions } = new AgentAssignment(minimal());
    assert.equal(permissions.canSellCash, true);
    assert.equal(permissions.canSellOnline, true);
    assert.equal(permissions.canCancel, false);
    assert.equal(permissions.cancelWindowMins, 0);
    assert.equal(permissions.maxSeatsPerBooking, null);
    assert.equal(permissions.maxDiscountPct, 0);
  });

  await t.test("record a zero commission explicitly", () => {
    const { operatorCommission } = new AgentAssignment(minimal());
    assert.equal(operatorCommission.mode, "PERCENT");
    assert.equal(operatorCommission.value, 0);
  });

  await t.test("leave every lifecycle timestamp unset but invitedAt", () => {
    const doc = new AgentAssignment(minimal());
    assert.ok(doc.invitedAt instanceof Date);
    for (const path of ["acceptedAt", "declinedAt", "suspendedAt", "revokedAt", "expiresAt"]) {
      assert.equal(doc[path], null, `${path} must start null`);
    }
  });
});
