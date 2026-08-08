"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createAdminOwnerProfileService } = require("../../../src/modules/admin/bus-owner-management/admin-owner-profile.service");

test("admin-owner-profile-authorization unit tests", async (t) => {
  const validAdminId = "64f000000000000000000099";
  const validOwnerId = "64f000000000000000000001";
  const validReason = "Updating user address for official records";

  function makeService(adminRecord, overrides = {}) {
    let repoCalled = false;
    const repository = {
      findOwnerForProfileUpdate: async () => { repoCalled = true; return { _id: validOwnerId, user: "u1", verificationStatus: "pending" }; },
      findLinkedUserForProfileUpdate: async () => ({ _id: "u1", name: "Old Name" }),
      findUserConflict: async () => null,
      updateUserWithVersion: async () => ({ _id: "u1", __v: 1 }),
      updateOwnerWithVersion: async () => ({ _id: validOwnerId, __v: 1 }),
      ...overrides.repository,
    };

    const deps = {
      repository,
      resolveAuthorizedAdminActor: async (actor) => {
        if (!actor || !actor.adminId || !actor.tokenRole) {
          const err = new Error("Admin identity missing.");
          err.statusCode = 401;
          err.code = "ADMIN_IDENTITY_MISSING";
          throw err;
        }
        if (adminRecord === null) {
          const err = new Error("Admin not found.");
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
    return { service: createAdminOwnerProfileService(deps), wasRepoCalled: () => repoCalled };
  }

  await t.test("missing actor returns 401 before repository lookup or writes", async () => {
    const { service, wasRepoCalled } = makeService({ _id: validAdminId, role: "ADMIN", isActive: true });
    await assert.rejects(
      async () => service.updateAdminOwnerProfile({ id: validOwnerId, name: "New Name", changeReason: validReason, actor: null }),
      (err) => err.statusCode === 401
    );
    assert.equal(wasRepoCalled(), false);
  });

  await t.test("role drift returns 403 ADMIN_ROLE_MISMATCH before repository lookup", async () => {
    const { service, wasRepoCalled } = makeService({ _id: validAdminId, role: "SUB_ADMIN", isActive: true });
    await assert.rejects(
      async () => service.updateAdminOwnerProfile({ id: validOwnerId, name: "New Name", changeReason: validReason, actor: { adminId: validAdminId, tokenRole: "ADMIN" } }),
      (err) => err.statusCode === 403 && err.code === "ADMIN_ROLE_MISMATCH"
    );
    assert.equal(wasRepoCalled(), false);
  });

  await t.test("inactive admin returns 403 before repository lookup", async () => {
    const { service, wasRepoCalled } = makeService({ _id: validAdminId, role: "ADMIN", isActive: false });
    await assert.rejects(
      async () => service.updateAdminOwnerProfile({ id: validOwnerId, name: "New Name", changeReason: validReason, actor: { adminId: validAdminId, tokenRole: "ADMIN" } }),
      (err) => err.statusCode === 403 && err.code === "ADMIN_INACTIVE"
    );
    assert.equal(wasRepoCalled(), false);
  });
});
