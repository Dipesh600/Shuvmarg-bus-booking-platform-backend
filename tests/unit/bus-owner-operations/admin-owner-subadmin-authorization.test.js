"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveAuthorizedAdminActor } = require("../../../src/modules/admin/bus-owner-management/admin-actor.resolver");

test("SUB_ADMIN is authorized for bus-owner operations", async () => {
  const adminId = "64f000000000000000000099";
  const Admin = {
    findById: () => ({ lean: async () => ({
      _id: adminId,
      role: "SUB_ADMIN",
      isActive: true,
      accountLocked: false,
    }) }),
  };
  const admin = await resolveAuthorizedAdminActor(
    { adminId, tokenRole: "SUB_ADMIN" },
    { Admin }
  );
  assert.equal(admin.role, "SUB_ADMIN");
});
