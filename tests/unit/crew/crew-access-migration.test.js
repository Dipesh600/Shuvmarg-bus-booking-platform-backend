"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { migrationUpdateFor } = require("../../../scripts/migrateCrewAccessStates");

const now = new Date("2026-09-04T00:00:00Z");

test("migration preserves a persisted failed invitation instead of resetting it", () => {
  const update = migrationUpdateFor({ userId: "user", accessStatus: "INVITED",
    invitationDeliveryStatus: "FAILED", invitedAt: now }, { status: "invited" }, "driver", now);
  assert.equal(update.accessStatus, "INVITED");
  assert.equal(update.invitationDeliveryStatus, "FAILED");
  assert.equal(update.invitedAt, now);
});

test("migration maps legacy active and invited users to separate persisted states", () => {
  assert.equal(migrationUpdateFor({ userId: "user" }, { status: "active" }, "driver", now).accessStatus, "ACTIVE");
  assert.equal(migrationUpdateFor({ userId: "user" }, { status: "invited" }, "driver", now).accessStatus, "INVITED");
  assert.equal(migrationUpdateFor({}, null, "driver", now).accessStatus, "NOT_LINKED");
});

test("legacy suspension records an exact restorable state when authoritative user state permits it", () => {
  const update = migrationUpdateFor({ userId: "user", status: "SUSPENDED" },
    { status: "invited" }, "conductor", now);
  assert.equal(update.accessStatus, "SUSPENDED");
  assert.equal(update.accessStatusBeforeSuspension, "INVITED");
  assert.equal(update.invitationDeliveryStatus, "NOT_REQUIRED");
});
