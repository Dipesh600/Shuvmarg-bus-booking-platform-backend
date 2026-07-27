"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createPasswordResetController,
} = require("../../../src/modules/admin/user-management/password-reset.controller");
const {
  createAccountDeletionController,
} = require("../../../src/modules/admin/user-management/account-deletion.controller");
const {
  createUserStatusController,
  getAuditAction,
} = require("../../../src/modules/admin/user-management/user-status.controller");

const response = () => {
  let status;
  let body;
  return {
    status(value) { status = value; return this; },
    json(value) { body = value; return this; },
    result: () => ({ status, body }),
  };
};
const support = () => {
  const calls = [];
  return {
    calls,
    revokeUserSessions: async (...args) => calls.push(["revoke", ...args]),
    sendUserNotification: async (...args) => calls.push(["notify", ...args]),
    logAdminAction: async (...args) => calls.push(["audit", ...args]),
  };
};

test("admin user-management enforcement controllers", async (t) => {
  await t.test("password validation preserves exact first missing field", async () => {
    const handler = createPasswordResetController({
      User: {}, bcrypt: {}, isValidObjectId: () => true, support: support(),
    });
    for (const [body, message] of [
      [{}, "Id is required!"],
      [{ id: "u" }, "Password is required!"],
      [{ id: "u", password: "password" }, "Confirm password is required!"],
    ]) {
      const res = response();
      await handler({ body }, res);
      assert.deepEqual(res.result(), {
        status: 400,
        body: { success: false, message },
      });
    }
  });

  await t.test("password reset hashes, saves, revokes, and audits", async () => {
    const calls = support();
    const user = { async save() { this.saved = true; } };
    const handler = createPasswordResetController({
      User: { findById: () => ({ select: async () => user }) },
      bcrypt: { hash: async (value, rounds) => `${value}:${rounds}` },
      isValidObjectId: () => true,
      support: calls,
    });
    const res = response();
    await handler({
      body: { id: "u", password: "password", confirmPassword: "password" },
      adminInfo: { id: "a" },
    }, res);
    assert.equal(user.password, "password:12");
    assert.equal(user.forcePasswordChange, true);
    assert.equal(user.saved, true);
    assert.deepEqual(calls.calls[0], ["revoke", "u"]);
    assert.equal(calls.calls[1][2], "FORCE_PASSWORD_RESET");
    assert.equal(res.result().status, 200);
  });

  await t.test("account deletion blocks active bookings", async () => {
    const handler = createAccountDeletionController({
      User: { findById: async () => ({ _id: "u" }) },
      Booking: { countDocuments: async () => 2 },
      isValidObjectId: () => true,
      support: support(),
    });
    const res = response();
    await handler({ body: { id: "u" } }, res);
    assert.equal(res.result().status, 400);
    assert.match(res.result().body.message, /2 active\/upcoming booking/);
  });

  await t.test("account deletion preserves soft-delete side effects", async () => {
    const calls = support();
    const user = { _id: "u", status: "active", async save() {} };
    const handler = createAccountDeletionController({
      User: { findById: async () => user },
      Booking: { countDocuments: async () => 0 },
      isValidObjectId: () => true,
      support: calls,
      now: () => new Date("2026-01-01T00:00:00Z"),
    });
    const res = response();
    await handler({ body: { id: "u", reason: "fraud" }, adminInfo: { id: "a" } }, res);
    assert.equal(user.status, "inactive");
    assert.equal(user.deletedAt.toISOString(), "2026-01-01T00:00:00.000Z");
    assert.deepEqual(calls.calls.map((call) => call[0]), ["revoke", "notify", "audit"]);
    assert.deepEqual(calls.calls[2].at(-1), { previousStatus: "inactive" });
  });

  await t.test("status policy and ban side effects preserve contracts", async () => {
    assert.equal(getAuditAction("active", "banned"), "REACTIVATE");
    assert.equal(getAuditAction("inactive", "active"), "SUSPEND");
    const calls = support();
    const user = { _id: "u", status: "active", async save() {} };
    const handler = createUserStatusController({
      User: { findById: async () => user },
      isValidObjectId: () => true,
      support: calls,
      now: () => new Date("2026-01-01T00:00:00Z"),
    });
    const res = response();
    await handler({ body: { id: "u", status: "BANNED", reason: "fraud" }, adminInfo: { id: "a" } }, res);
    assert.equal(user.status, "banned");
    assert.deepEqual(calls.calls.map((call) => call[0]), ["revoke", "notify", "audit"]);
    assert.equal(calls.calls[2][2], "BAN");
    assert.equal(res.result().status, 200);
  });
});
