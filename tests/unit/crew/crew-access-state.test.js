"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { suspendCrewAccess, restoreCrewAccess } = require("../../../src/shared/crew/crew-access-state");

for (const state of ["INVITED", "ACTIVE"]) {
  test(`suspension and restoration preserve the exact ${state} access state`, () => {
    const profile = { accessStatus: state, accessStatusBeforeSuspension: null };
    suspendCrewAccess(profile);
    assert.deepEqual(profile, { accessStatus: "SUSPENDED", accessStatusBeforeSuspension: state });
    restoreCrewAccess(profile);
    assert.deepEqual(profile, { accessStatus: state, accessStatusBeforeSuspension: null });
  });
}

test("operational suspension does not invent login access for a registry-only profile", () => {
  const profile = { accessStatus: "NOT_LINKED", accessStatusBeforeSuspension: null };
  suspendCrewAccess(profile); restoreCrewAccess(profile);
  assert.deepEqual(profile, { accessStatus: "NOT_LINKED", accessStatusBeforeSuspension: null });
});

test("restoration fails closed when the previous state was not persisted", () => {
  assert.throws(() => restoreCrewAccess({ accessStatus: "SUSPENDED", accessStatusBeforeSuspension: null }), {
    statusCode: 409,
  });
});

test("removed access cannot be converted to suspension", () => {
  assert.throws(() => suspendCrewAccess({ accessStatus: "REMOVED" }), { statusCode: 409 });
});
