"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createBusOwnerNotificationService,
} = require("../../src/modules/notifications/bus-owner/bus-owner-notification.service");
const policy = require("../../src/modules/admin/fleet-management/fleet-status.policy");

function setup(overrides = {}) {
  const calls = [];
  const errors = [];
  const warnings = [];
  const service = createBusOwnerNotificationService({
    UserDeviceInfo: {
      find: async () => [{ token: "one" }, { token: null }, { token: "two" }],
    },
    emailManager: async (...args) => calls.push(["email", ...args]),
    notificationManager: async (...args) => calls.push(["push", ...args]),
    createLocalNotification: async (...args) => calls.push(["local", ...args]),
    sendOTP: async (...args) => calls.push(["sms", ...args]),
    generateStatusEmail: () => "<p>Status changed</p>",
    logger: {
      error: (...args) => errors.push(args),
      warn: (...args) => warnings.push(args),
    },
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
  return { notify: service.notifyFleetStatus, calls, errors, warnings, bus };
}

test("status notification preserves email, SMS, local, and push order", async () => {
  const { notify, calls, bus } = setup();
  await notify(bus, "REJECTED");
  assert.deepEqual(
    calls.map((entry) => entry[0]),
    ["email", "sms", "local", "push"]
  );
  assert.equal(calls[1][1], "9800000000");
  assert.match(calls[1][2], /Reason: Invalid document/);
  assert.deepEqual(calls[3].slice(1, 2)[0], ["one", "two"]);
});

test("push failure is logged and suppressed after durable local notification", async () => {
  const { notify, calls, errors, bus } = setup({
    notificationManager: async () => {
      throw new Error("push down");
    },
  });
  await notify(bus, "APPROVED");
  assert.match(errors[0][0], /Push Notification Error/);
  assert.deepEqual(
    calls.map((entry) => entry[0]),
    ["email", "sms", "local"]
  );
});

test("email and SMS failures are isolated so lifecycle decisions remain successful", async () => {
  const fatal = setup({
    emailManager: async () => {
      throw new Error("email down");
    },
  });
  await fatal.notify(fatal.bus, "APPROVED");
  assert.match(fatal.warnings[0][0], /Email notification failed/);
  assert.deepEqual(fatal.calls.map((entry) => entry[0]), ["sms", "local", "push"]);

  const sms = setup({
    sendOTP: async () => {
      throw new Error("sms down");
    },
  });
  await sms.notify(sms.bus, "APPROVED");
  assert.match(sms.warnings[0][0], /SMS notification failed/);
  assert.deepEqual(sms.calls.map((entry) => entry[0]), ["email", "local", "push"]);
});
