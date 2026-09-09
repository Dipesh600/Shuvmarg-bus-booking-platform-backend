"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const policy = require("../../../src/modules/notifications/outbox/notification-outbox.policy");
const { enabledMessageTypes, resetProviderCircuitForTests, smsWorkerEnabled } = require("../../../services/notificationOutboxRecovery");

test("SMS phone normalization accepts Nepal formats and rejects invalid recipients", () => {
  assert.equal(policy.normalizePhone("+977 980-000-0001"), "9800000001");
  assert.equal(policy.normalizePhone("09800000001"), "9800000001");
  assert.throws(() => policy.normalizePhone("123"), /valid Nepal mobile/);
  assert.equal(policy.maskPhone("9800000001"), "******0001");
});

test("worker rollout accepts only known message families", () => {
  assert.deepEqual(enabledMessageTypes({ SMS_OUTBOX_ENABLED_TYPES: "booking_confirmed, refund_status" }),
    ["BOOKING_CONFIRMED", "REFUND_STATUS"]);
  assert.equal(enabledMessageTypes({}), null);
  assert.throws(() => enabledMessageTypes({ SMS_OUTBOX_ENABLED_TYPES: "UNKNOWN" }), /Unsupported/);
});

test("worker rollout is explicit and refuses missing provider configuration", () => {
  resetProviderCircuitForTests();
  const logs = [];
  const logger = { error: (...args) => logs.push(args) };
  assert.equal(smsWorkerEnabled({}, logger), false);
  assert.equal(smsWorkerEnabled({ SMS_OUTBOX_WORKER_ENABLED: "true" }, logger), false);
  assert.equal(logs.length, 1);
  assert.equal(smsWorkerEnabled({ SMS_OUTBOX_WORKER_ENABLED: "true", SPARROW_SMS_TOKEN: "configured",
    SMS_OUTBOX_ENABLED_TYPES: "AGENT_INVITATION" }, logger), true);
});

test("SMS delivery errors are classified without leaking phone or token values", () => {
  assert.deepEqual(policy.classifyDeliveryError({ code: "ETIMEDOUT" }), {
    retryable: true, category: "TEMPORARY", code: "ETIMEDOUT",
  });
  assert.deepEqual(policy.classifyDeliveryError({ statusCode: 400, code: "INVALID" }), {
    retryable: false, category: "PERMANENT", code: "INVALID",
  });
  assert.equal(policy.sanitizeErrorMessage("token=secret 9800000001"), "token=[REDACTED] **********");
});

test("retry delays increase after each failed attempt", () => {
  const original = Math.random;
  Math.random = () => 0;
  try {
    const start = new Date("2026-09-09T00:00:00.000Z");
    assert.equal(policy.nextRetryAt(1, start).getTime() - start.getTime(), 60_000);
    assert.equal(policy.nextRetryAt(2, start).getTime() - start.getTime(), 300_000);
    assert.equal(policy.nextRetryAt(4, start).getTime() - start.getTime(), 3_600_000);
  } finally { Math.random = original; }
});
