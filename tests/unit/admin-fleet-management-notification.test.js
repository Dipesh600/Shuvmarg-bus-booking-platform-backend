"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createFleetNotificationService,
} = require("../../src/modules/admin/fleet-management/fleet-notification.service");
const policy = require("../../src/modules/admin/fleet-management/fleet-status.policy");

function setup(overrides = {}) {
  const calls = [];
  const errors = [];
  const notify = createFleetNotificationService({
    UserDeviceInfo: {
      find: async () => [{ token: "one" }, { token: null }, { token: "two" }],
    },
    emailManager: async (...args) => calls.push(["email", ...args]),
    notificationManager: async (...args) => calls.push(["push", ...args]),
    createLocalNotification: async (...args) => calls.push(["local", ...args]),
    sendOTP: async (...args) => calls.push(["sms", ...args]),
    console: { error: (...args) => errors.push(args) },
    policy,
    ...overrides,
  });
  const bus = {
    _id: "f1",
    busName: "Night Bus",
    busNumber: "BA-1",
    rejectionReason: "Invalid document",
    ownerId: {
      _id: "u1",
      name: "Owner",
      email: "owner@example.com",
      contactNumber: "9800000000",
    },
  };
  return { notify, calls, errors, bus };
}

test("status notification preserves email, push, local, and SMS order", async () => {
  const { notify, calls, bus } = setup();
  await notify(bus, "REJECTED");
  assert.deepEqual(
    calls.map((entry) => entry[0]),
    ["email", "push", "local", "sms"]
  );
  assert.deepEqual(calls[1].slice(1, 2)[0], ["one", "two"]);
  assert.equal(calls[3][1], "9800000000");
  assert.match(calls[3][2], /Reason: Invalid document/);
});

test("push failure is logged, suppressed, and SMS still runs", async () => {
  const { notify, calls, errors, bus } = setup({
    notificationManager: async () => {
      throw new Error("push down");
    },
  });
  await notify(bus, "APPROVED");
  assert.equal(errors[0][0], "Push Notification Error:");
  assert.deepEqual(
    calls.map((entry) => entry[0]),
    ["email", "sms"]
  );
});

test("email failure remains fatal while SMS failure is suppressed", async () => {
  const fatal = setup({
    emailManager: async () => {
      throw new Error("email down");
    },
  });
  await assert.rejects(fatal.notify(fatal.bus, "APPROVED"), /email down/);
  assert.equal(fatal.calls.length, 0);

  const sms = setup({
    sendOTP: async () => {
      throw new Error("sms down");
    },
  });
  await sms.notify(sms.bus, "APPROVED");
  assert.equal(sms.errors[0][0], "SMS Error:");
});
