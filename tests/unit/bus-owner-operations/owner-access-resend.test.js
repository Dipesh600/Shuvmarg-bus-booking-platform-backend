"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createOwnerAccessResendService } = require("../../../src/modules/admin/bus-owner-management/owner-access-resend.service");

test("SUB_ADMIN can securely reissue an unused operator credential", async () => {
  const userId = "64f000000000000000000001";
  const adminId = "64f000000000000000000099";
  const now = new Date("2026-08-23T00:00:00.000Z");
  const user = {
    _id: userId,
    name: "Owner",
    phone: "9841234567",
    roles: ["busOwner"],
    status: "active",
    forcePasswordChange: true,
  };
  const updates = [];
  const User = {
    findById: () => ({ select: async () => user }),
    findOneAndUpdate: async (query, update) => {
      updates.push({ query, update });
      return { ...user, temporaryCredentialVersion: 2 };
    },
  };
  let sent;
  const service = createOwnerAccessResendService({
    User,
    resolveAuthorizedAdminActor: async (actor) => {
      assert.deepEqual(actor, { adminId, tokenRole: "SUB_ADMIN" });
      return { _id: adminId, role: "SUB_ADMIN" };
    },
    clock: () => now,
    env: { NODE_ENV: "production", OPERATOR_APP_URL: "https://operator-staging.shuvmarg.com" },
    generatePassword: () => "SecurePass7!",
    bcryptHash: async () => "new-hash",
    notifyNewOwnerCredentials: async (input) => {
      sent = input;
      return { status: "DELIVERED", channel: "SMS", canRetry: false };
    },
  });

  const result = await service.resendOwnerAccess({
    userId,
    actor: { adminId, tokenRole: "SUB_ADMIN" },
  });

  assert.equal(result.credentialMode, "TEMPORARY_PASSWORD");
  assert.equal(result.notification.status, "DELIVERED");
  assert.deepEqual(updates[0].query.$or, [
    { temporaryCredentialVersion: 0 },
    { temporaryCredentialVersion: { $exists: false } },
  ]);
  assert.equal(updates[0].update.$set.temporaryCredentialIssuedBy, adminId);
  assert.deepEqual(updates[0].update.$inc, { temporaryCredentialVersion: 1, tokenVersion: 1 });
  assert.equal(sent.password, "SecurePass7!");
  assert.equal(sent.loginUrl, "https://operator-staging.shuvmarg.com/login");
  assert.equal(sent.expiresAt.toISOString(), "2026-08-24T00:00:00.000Z");
});
