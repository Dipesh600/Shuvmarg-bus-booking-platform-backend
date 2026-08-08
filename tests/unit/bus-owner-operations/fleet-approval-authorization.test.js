"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createFleetApprovalService } = require("../../../src/modules/admin/fleet-management/fleet-status.service");

test("fleet-approval-authorization unit tests", async (t) => {
  const validAdminId = "64f000000000000000000099";
  const validFleetId = "64f000000000000000000002";

  function makeService(adminRecord, overrides = {}) {
    let atomicCalled = false;
    const repository = {
      atomicDecidePendingFleet: async () => { atomicCalled = true; return { _id: validFleetId }; },
      findApprovalStatusById: async () => ({ approvalStatus: "PENDING" }),
      ...overrides.repository,
    };
    const deps = {
      repository,
      resolveAuthorizedAdminActor: async (actor) => {
        if (!actor || !actor.adminId || !actor.tokenRole) {
          const err = new Error("Admin identity reference missing.");
          err.statusCode = 401;
          err.code = "ADMIN_IDENTITY_MISSING";
          throw err;
        }
        if (adminRecord === null) {
          const err = new Error("Admin record not found.");
          err.statusCode = 401;
          err.code = "ADMIN_NOT_FOUND";
          throw err;
        }
        if (actor.tokenRole !== adminRecord.role) {
          const err = new Error("Role mismatch.");
          err.statusCode = 403;
          err.code = "ADMIN_ROLE_MISMATCH";
          throw err;
        }
        if (adminRecord.isActive !== true) {
          const err = new Error("Admin inactive.");
          err.statusCode = 403;
          err.code = "ADMIN_INACTIVE";
          throw err;
        }
        return adminRecord;
      },
      clock: () => new Date("2026-08-05T12:00:00Z"),
      ...overrides,
    };
    return { service: createFleetApprovalService(deps), wasAtomicCalled: () => atomicCalled };
  }

  await t.test("missing actor returns 401 before atomic update", async () => {
    const { service, wasAtomicCalled } = makeService({ _id: validAdminId, role: "ADMIN", isActive: true });
    await assert.rejects(
      async () => service.decideFleetApproval({ fleetId: validFleetId, status: "APPROVED", actor: null }),
      (err) => err.statusCode === 401
    );
    assert.equal(wasAtomicCalled(), false);
  });

  await t.test("role drift returns 403 ADMIN_ROLE_MISMATCH before atomic update", async () => {
    const { service, wasAtomicCalled } = makeService({ _id: validAdminId, role: "SUB_ADMIN", isActive: true });
    await assert.rejects(
      async () => service.decideFleetApproval({ fleetId: validFleetId, status: "APPROVED", actor: { adminId: validAdminId, tokenRole: "ADMIN" } }),
      (err) => err.statusCode === 403 && err.code === "ADMIN_ROLE_MISMATCH"
    );
    assert.equal(wasAtomicCalled(), false);
  });

  await t.test("inactive admin returns 403 before atomic update", async () => {
    const { service, wasAtomicCalled } = makeService({ _id: validAdminId, role: "ADMIN", isActive: false });
    await assert.rejects(
      async () => service.decideFleetApproval({ fleetId: validFleetId, status: "APPROVED", actor: { adminId: validAdminId, tokenRole: "ADMIN" } }),
      (err) => err.statusCode === 403 && err.code === "ADMIN_INACTIVE"
    );
    assert.equal(wasAtomicCalled(), false);
  });
});
