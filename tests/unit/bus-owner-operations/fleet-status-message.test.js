"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildStatusMessage } = require("../../../src/modules/admin/fleet-management/fleet-status.policy");

test("fleet status messages tell owners the correct next action", () => {
  const bus = {
    busName: "Mountain Express",
    busNumber: "BA 1 PA 1234",
    rejectionReason: "Replace the expired insurance certificate",
  };

  const rejected = buildStatusMessage(bus, "REJECTED");
  assert.match(rejected.body, /Replace the expired insurance certificate/);
  assert.match(rejected.body, /correct and resubmit/i);

  const approved = buildStatusMessage(bus, "APPROVED");
  assert.match(approved.body, /approved/i);
  assert.match(approved.body, /driver, schedule, and activation setup/i);
  assert.doesNotMatch(approved.body, /operational|live/i);
});
