"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createOwnerAccessResendService } = require("../../../src/modules/admin/bus-owner-management/owner-access-resend.service");

test("SUB_ADMIN can resend operator account activation without issuing a password", async () => {
  const userId = "64f000000000000000000001";
  const adminId = "64f000000000000000000099";
  const now = new Date("2026-08-23T00:00:00.000Z");
  const user = {
    _id: userId,
    name: "Owner",
    phone: "9841234567",
    roles: ["busOwner"],
    status: "invited",
    forcePasswordChange: true,
  };
  const User = {
    findById: async () => user,
  };
  let sent;
  let cancelledReference;
  const service = createOwnerAccessResendService({
    User,
    resolveAuthorizedAdminActor: async (actor) => {
      assert.deepEqual(actor, { adminId, tokenRole: "SUB_ADMIN" });
      return { _id: adminId, role: "SUB_ADMIN" };
    },
    clock: () => now,
    env: { NODE_ENV: "production", OPERATOR_APP_URL: "https://operator-staging.shuvmarg.com" },
    notificationOutbox: {
      cancelPendingSms: async (reference) => { cancelledReference = reference; },
    },
    notifyNewOwnerCredentials: async (input) => {
      sent = input;
      return { status: "PROVIDER_ACCEPTED", channel: "SMS", canRetry: false };
    },
  });

  const result = await service.resendOwnerAccess({
    userId,
    actor: { adminId, tokenRole: "SUB_ADMIN" },
  });

  assert.equal(result.credentialMode, "ACCOUNT_ACTIVATION");
  assert.equal(result.notification.status, "PROVIDER_ACCEPTED");
  assert.equal(cancelledReference, `bus-owner-user:${userId}`);
  assert.equal(sent.password, undefined);
  assert.equal(sent.loginUrl, "https://operator-staging.shuvmarg.com/login");
  assert.equal(sent.phone, user.phone);
});
