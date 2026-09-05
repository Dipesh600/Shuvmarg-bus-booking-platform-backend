"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createCrewController } = require("../../../src/modules/bus-owner/crew/crew.controller");

const response = () => ({
  code: 0,
  status(code) { this.code = code; return this; },
  json(body) { this.body = body; return this; },
});

test("security completion is reported as an update even when the crew account was already assigned", async () => {
  const assignmentService = { async assign() { return {
    alreadyAssigned: true, securityUpdated: true, notificationStatus: "NOT_REQUESTED",
    approvalStatus: "APPROVED", profileStatus: "AVAILABLE", accessStatus: "ACTIVE",
  }; } };
  const controller = createCrewController({ assignmentService, DriverProfile: {}, ConductorProfile: {},
    logger: { error() {} } });
  const res = response();
  await controller.assignDriver({ userInfo: { id: "owner" }, body: {}, files: {} }, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.message, "Driver security checks completed. Existing account is ready to use.");
  assert.doesNotMatch(res.body.message, /already assigned/i);
});
