"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createUserManagementSupportService,
} = require("../../../src/modules/admin/user-management/user-management-support.service");

test("admin user-management support service", async (t) => {
  await t.test("revokes every refresh token for the exact user", async () => {
    let query;
    const support = createUserManagementSupportService({
      RefreshToken: { deleteMany: async (value) => (query = value) },
      AdminAuditLog: {},
      UserDeviceInfo: {},
    });
    await support.revokeUserSessions("u1");
    assert.deepEqual(query, { userId: "u1" });
  });

  await t.test("creates local notification and pushes valid device tokens", async () => {
    const calls = [];
    const support = createUserManagementSupportService({
      RefreshToken: {},
      AdminAuditLog: {},
      UserDeviceInfo: {
        find: async () => [{ token: "a" }, { token: null }, { token: "b" }],
      },
      createLocalNotification: async (...args) => calls.push(["local", ...args]),
      notificationManager: async (...args) => calls.push(["push", ...args]),
    });
    await support.sendUserNotification("u", "title", "body");
    assert.deepEqual(calls[0], [
      "local", "u", "ACCOUNT_ACTION", "title", "body", {},
    ]);
    assert.deepEqual(calls[1], ["push", ["a", "b"], "title", "body"]);
  });

  await t.test("notification failure is logged and never escapes", async () => {
    const errors = [];
    const support = createUserManagementSupportService({
      RefreshToken: {},
      AdminAuditLog: {},
      UserDeviceInfo: { find: async () => { throw new Error("devices failed"); } },
      logger: { error: (...args) => errors.push(args) },
    });
    await support.sendUserNotification("u", "title", "body");
    assert.equal(errors.length, 1);
    assert.match(errors[0][0], /Failed to notify user u/);
  });

  await t.test("audit payload is exact and audit failure is nonblocking", async () => {
    const payloads = [];
    const errors = [];
    let fail = false;
    const support = createUserManagementSupportService({
      RefreshToken: {},
      UserDeviceInfo: {},
      AdminAuditLog: {
        create: async (value) => {
          if (fail) throw new Error("audit failed");
          payloads.push(value);
        },
      },
      logger: { error: (...args) => errors.push(args) },
    });
    await support.logAdminAction("a", "BAN", "user", "u", "reason", {
      previousStatus: "active",
    });
    assert.deepEqual(payloads[0], {
      adminId: "a",
      action: "BAN",
      targetType: "user",
      targetId: "u",
      reason: "reason",
      metadata: { previousStatus: "active" },
    });
    fail = true;
    await support.logAdminAction("a", "BAN", "user", "u", null);
    assert.equal(errors.length, 1);
  });
});
