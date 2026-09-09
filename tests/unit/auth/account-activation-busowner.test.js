"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { requestedActivationRole, activationEligibility } = require("../../../src/modules/auth/account-activation/account-activation.policy");

test("the bus-owner portal can activate only an invited account holding the busOwner role", () => {
  assert.equal(requestedActivationRole("busowner"), "busOwner");
  assert.equal(activationEligibility({ status: "invited", roles: ["busOwner"] }, "busOwner").state, "PENDING");
  assert.equal(activationEligibility({ status: "invited", roles: ["agent"] }, "busOwner").state, "NOT_FOUND");
  assert.equal(activationEligibility({ status: "active", roles: ["busOwner"] }, "busOwner").state, "ACTIVE");
});
