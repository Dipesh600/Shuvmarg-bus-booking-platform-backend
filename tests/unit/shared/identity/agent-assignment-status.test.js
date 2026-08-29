"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ASSIGNMENT_STATUSES,
  INVITE_EXPIRY_DAYS,
  LIVE_ASSIGNMENT_STATUSES,
  SELLABLE_ASSIGNMENT_STATUSES,
  canTransition,
  inviteExpiryFrom,
  isAssignmentLive,
  isAssignmentSellable,
  isAssignmentStatus,
} = require("../../../../src/shared/identity/agent-assignment-status.js");

test("assignment statuses", async (t) => {
  await t.test("cover the documented machine and nothing else", () => {
    assert.deepEqual(Object.keys(ASSIGNMENT_STATUSES).sort(), [
      "ACTIVE", "DECLINED", "EXPIRED", "INVITED", "REVOKED", "SUSPENDED",
    ]);
  });

  await t.test("are frozen, so a caller cannot add one at runtime", () => {
    assert.throws(() => { ASSIGNMENT_STATUSES.WHATEVER = "WHATEVER"; }, TypeError);
  });

  await t.test("recognise only own properties", () => {
    assert.equal(isAssignmentStatus("ACTIVE"), true);
    // The prototype-chain trap agent-enums.js documents: a plain lookup of
    // "constructor" would resolve truthy.
    assert.equal(isAssignmentStatus("constructor"), false);
    assert.equal(isAssignmentStatus("toString"), false);
    assert.equal(isAssignmentStatus(undefined), false);
  });
});

test("live vs terminal", async (t) => {
  await t.test("live means the relationship still exists", () => {
    assert.deepEqual([...LIVE_ASSIGNMENT_STATUSES], ["INVITED", "ACTIVE", "SUSPENDED"]);
  });

  await t.test("terminal statuses are not live — this is what the partial index filters on", () => {
    for (const status of ["REVOKED", "DECLINED", "EXPIRED"]) {
      assert.equal(isAssignmentLive(status), false, `${status} must not be live`);
    }
  });

  await t.test("only ACTIVE may sell", () => {
    assert.deepEqual([...SELLABLE_ASSIGNMENT_STATUSES], ["ACTIVE"]);
    assert.equal(isAssignmentSellable("ACTIVE"), true);
    // INVITED is live but unaccepted; SUSPENDED is live but paused. Selling is
    // strictly narrower than existing.
    assert.equal(isAssignmentSellable("INVITED"), false);
    assert.equal(isAssignmentSellable("SUSPENDED"), false);
  });
});

test("transitions", async (t) => {
  await t.test("an invite may be accepted, declined, expired or withdrawn", () => {
    assert.equal(canTransition("INVITED", "ACTIVE"), true);
    assert.equal(canTransition("INVITED", "DECLINED"), true);
    assert.equal(canTransition("INVITED", "EXPIRED"), true);
    assert.equal(canTransition("INVITED", "REVOKED"), true);
  });

  await t.test("an invite cannot skip straight to SUSPENDED", () => {
    assert.equal(canTransition("INVITED", "SUSPENDED"), false);
  });

  await t.test("ACTIVE and SUSPENDED move both ways", () => {
    assert.equal(canTransition("ACTIVE", "SUSPENDED"), true);
    assert.equal(canTransition("SUSPENDED", "ACTIVE"), true);
  });

  await t.test("either live state may be revoked", () => {
    assert.equal(canTransition("ACTIVE", "REVOKED"), true);
    assert.equal(canTransition("SUSPENDED", "REVOKED"), true);
  });

  await t.test("terminal statuses go nowhere", () => {
    for (const from of ["REVOKED", "DECLINED", "EXPIRED"]) {
      for (const to of Object.keys(ASSIGNMENT_STATUSES)) {
        assert.equal(canTransition(from, to), false, `${from} → ${to} must be rejected`);
      }
    }
  });

  await t.test("nothing transitions back into INVITED", () => {
    // An assignment is invited once. Re-inviting a revoked agent is a new row,
    // which is exactly why the unique index is partial.
    for (const from of Object.keys(ASSIGNMENT_STATUSES)) {
      assert.equal(canTransition(from, "INVITED"), false, `${from} → INVITED must be rejected`);
    }
  });

  await t.test("an unrecognised current status fails closed rather than throwing", () => {
    // Rows written before this slice, or by a script that bypassed validation.
    assert.equal(canTransition("OPERATOR_LINKED", "ACTIVE"), false);
    assert.equal(canTransition(undefined, "ACTIVE"), false);
    assert.equal(canTransition("constructor", "ACTIVE"), false);
  });

  await t.test("an unrecognised target is rejected", () => {
    assert.equal(canTransition("ACTIVE", "APPROVED"), false);
    assert.equal(canTransition("ACTIVE", undefined), false);
  });
});

test("invite expiry", async (t) => {
  await t.test("is seven days out", () => {
    assert.equal(INVITE_EXPIRY_DAYS, 7);
    const sentAt = new Date("2026-08-27T10:00:00.000Z");
    assert.equal(inviteExpiryFrom(sentAt).toISOString(), "2026-09-03T10:00:00.000Z");
  });

  await t.test("accepts an ISO string as well as a Date", () => {
    assert.equal(
      inviteExpiryFrom("2026-08-27T10:00:00.000Z").toISOString(),
      "2026-09-03T10:00:00.000Z",
    );
  });
});
