"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const AgentAssignment = require("../../../models/agentAssignmentModel.js");

const oid = () => new mongoose.Types.ObjectId();
const minimal = () => ({ agentId: oid(), operatorId: oid(), ownerId: oid() });

test("AgentAssignment validation", async (t) => {
  await t.test("rejects a status outside the machine", () => {
    const doc = new AgentAssignment({ ...minimal(), status: "APPROVED" });
    assert.ok(doc.validateSync().errors.status);
  });

  await t.test("rejects an access scope from the legacy vocabulary", () => {
    // Agent.busAccessScope used ALL_OPERATOR_BUSES / SPECIFIC_ROUTES. Those
    // strings must not quietly survive the move to this collection.
    const doc = new AgentAssignment({ ...minimal(), accessScope: "ALL_OPERATOR_BUSES" });
    assert.ok(doc.validateSync().errors.accessScope);
  });

  await t.test("rejects a percent commission above 100", () => {
    const doc = new AgentAssignment({
      ...minimal(), operatorCommission: { mode: "PERCENT", value: 150 },
    });
    assert.ok(doc.validateSync().errors["operatorCommission.value"]);
  });

  await t.test("allows a large flat commission", () => {
    const doc = new AgentAssignment({
      ...minimal(), operatorCommission: { mode: "FLAT_PER_SEAT", value: 5000 },
    });
    assert.equal(doc.validateSync(), undefined);
  });

  await t.test("rejects a negative commission", () => {
    const doc = new AgentAssignment({
      ...minimal(), operatorCommission: { mode: "FLAT_PER_SEAT", value: -1 },
    });
    assert.ok(doc.validateSync().errors["operatorCommission.value"]);
  });

  await t.test("rejects a seat cap of zero, while keeping null as uncapped", () => {
    const capped = new AgentAssignment({ ...minimal(), permissions: { maxSeatsPerBooking: 0 } });
    assert.ok(capped.validateSync().errors["permissions.maxSeatsPerBooking"]);
    const uncapped = new AgentAssignment({
      ...minimal(), permissions: { maxSeatsPerBooking: null },
    });
    assert.equal(uncapped.validateSync(), undefined);
  });

  await t.test("rejects a discount above 100 percent", () => {
    const doc = new AgentAssignment({ ...minimal(), permissions: { maxDiscountPct: 101 } });
    assert.ok(doc.validateSync().errors["permissions.maxDiscountPct"]);
  });

  await t.test("rejects a negative cancel window", () => {
    const doc = new AgentAssignment({ ...minimal(), permissions: { cancelWindowMins: -5 } });
    assert.ok(doc.validateSync().errors["permissions.cancelWindowMins"]);
  });

  await t.test("separates agent decline reasons from operator lifecycle notes", () => {
    const doc = new AgentAssignment({
      ...minimal(), statusReason: "agent-authored", operatorNote: "operator-authored",
    });
    assert.equal(doc.validateSync(), undefined);
    assert.equal(doc.statusReason, "agent-authored");
    assert.equal(doc.operatorNote, "operator-authored");
    const tooLong = new AgentAssignment({ ...minimal(), operatorNote: "x".repeat(501) });
    assert.ok(tooLong.validateSync().errors.operatorNote);
  });
});

test("AgentAssignment indexes", async (t) => {
  const indexes = AgentAssignment.schema.indexes();
  const named = (name) => indexes.find(([, options]) => options.name === name);

  await t.test("enforce one live assignment per agent per operator", () => {
    const found = named("one_live_assignment_per_agent_operator");
    assert.ok(found, "the partial unique index must exist");
    const [keys, options] = found;
    assert.deepEqual(keys, { agentId: 1, operatorId: 1 });
    assert.equal(options.unique, true);
    // Partial, so a revoked agent can be re-hired and the old row survives as
    // history. A plain unique index would make re-hiring impossible.
    assert.deepEqual(options.partialFilterExpression, {
      status: { $in: ["INVITED", "ACTIVE", "SUSPENDED"] },
    });
  });

  await t.test("serve both list views", () => {
    const keys = indexes.map(([key]) => JSON.stringify(key));
    assert.ok(keys.includes(JSON.stringify({ operatorId: 1, status: 1, createdAt: -1 })));
    assert.ok(keys.includes(JSON.stringify({ agentId: 1, status: 1, createdAt: -1 })));
  });

  await t.test("never expire a row out of existence", () => {
    // Expiry is a transition to EXPIRED, not a deletion: both sides may need to
    // see that an invite lapsed.
    for (const [, options] of indexes) {
      assert.equal(options.expireAfterSeconds, undefined);
    }
  });
});

test("AgentAssignment holds no money (master plan D8)", async (t) => {
  await t.test("has no balance, credit or settlement paths", () => {
    const paths = Object.keys(AgentAssignment.schema.paths).join(" ").toLowerCase();
    for (const banned of ["balance", "credit", "settle", "payout", "ledger", "wallet"]) {
      assert.ok(!paths.includes(banned), `schema must not carry a "${banned}" field`);
    }
  });
});
