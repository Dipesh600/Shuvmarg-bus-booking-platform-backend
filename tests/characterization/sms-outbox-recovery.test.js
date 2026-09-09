"use strict";

const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const db = require("../helpers/db");
const Outbox = require("../../models/notificationOutboxModel");
const { enqueueSms, replayFailedSms } = require("../../src/modules/notifications/outbox/notification-outbox.service");
const { deliverSmsNotification, recoverSmsNotifications } = require("../../services/notificationOutboxRecovery");

before(async () => { await db.connect(); await Outbox.init(); });
beforeEach(async () => { await Outbox.deleteMany({}); });
after(db.disconnect);

const input = (overrides = {}) => ({
  messageType: "AGENT_INVITATION",
  idempotencyKey: "agent:507f1f77bcf86cd799439011:invite:1",
  businessReference: "agent:507f1f77bcf86cd799439011",
  recipientPhone: "+977 9800000001",
  body: "Open the Partner app and activate your invited account.",
  ...overrides,
});

test("enqueue is idempotent and stores sensitive delivery fields as unselected", async () => {
  const [first, second] = await Promise.all([enqueueSms(input()), enqueueSms(input())]);
  assert.equal(String(first._id), String(second._id));
  assert.equal(await Outbox.countDocuments({}), 1);
  const ordinary = await Outbox.findById(first._id).lean();
  assert.equal(ordinary.recipientPhone, undefined);
  assert.equal(ordinary.body, undefined);
  assert.equal(ordinary.recipientMasked, "******0001");
  const sensitive = await Outbox.findById(first._id).select("+recipientPhone +body").lean();
  assert.equal(sensitive.recipientPhone, "9800000001");
});

test("manual replay creates one audited message version per minute", async () => {
  const source = await enqueueSms(input());
  await Outbox.updateOne({ _id: source._id }, { $set: { status: "FAILED" } });
  const now = new Date("2026-09-09T00:00:10.000Z");
  const actor = { actorType: "ADMIN", actorId: "admin-1", reason: "Provider token restored" };
  const [first, second] = await Promise.all([
    replayFailedSms(source._id, actor, { now }), replayFailedSms(source._id, actor, { now }),
  ]);
  assert.equal(String(first._id), String(second._id));
  assert.equal(await Outbox.countDocuments({}), 2);
  assert.equal(first.manualReplay.actorId, "admin-1");
  assert.equal(String(first.manualReplay.sourceMessageId), String(source._id));
});

test("concurrent workers claim and send a due SMS once", async () => {
  const job = await enqueueSms(input());
  let sends = 0;
  const send = async () => { sends += 1; return { queued: true, providerReference: "provider-1" }; };
  await Promise.all([deliverSmsNotification(job._id, { send }), deliverSmsNotification(job._id, { send })]);
  const saved = await Outbox.findById(job._id).lean();
  assert.equal(sends, 1);
  assert.equal(saved.status, "PROVIDER_ACCEPTED");
  assert.equal(saved.providerReference, "provider-1");
  assert.equal(saved.attempts, 1);
});

test("temporary failures retry while permanent failures stop", async () => {
  const retryJob = await enqueueSms(input());
  await deliverSmsNotification(retryJob._id, { send: async () => {
    throw Object.assign(new Error("timeout"), { code: "ETIMEDOUT" });
  } });
  const retry = await Outbox.findById(retryJob._id).lean();
  assert.equal(retry.status, "RETRY_SCHEDULED");
  assert.ok(retry.nextAttemptAt > retry.lastAttemptAt);

  const failedJob = await enqueueSms(input({ idempotencyKey: "agent:2:invite:1" }));
  await deliverSmsNotification(failedJob._id, { send: async () => {
    throw Object.assign(new Error("invalid destination"), { retryable: false, category: "RECIPIENT", providerCode: "INVALID_PHONE" });
  } });
  const failed = await Outbox.findById(failedJob._id).lean();
  assert.equal(failed.status, "FAILED");
  assert.equal(failed.lastError.code, "INVALID_PHONE");
});

test("expired jobs are never sent and expired leases are recovered", async () => {
  const expired = await enqueueSms(input({ expiresAt: new Date(0) }));
  let sends = 0;
  await recoverSmsNotifications({ send: async () => { sends += 1; return { queued: true }; } });
  assert.equal(sends, 0);
  assert.equal((await Outbox.findById(expired._id)).status, "EXPIRED");

  const recoverable = await enqueueSms(input({ idempotencyKey: "agent:3:invite:1" }));
  await Outbox.updateOne({ _id: recoverable._id }, { $set: {
    status: "PROCESSING", leaseToken: "lost", leaseExpiresAt: new Date(0),
  } });
  await recoverSmsNotifications({ send: async () => { sends += 1; return { queued: true }; } });
  assert.equal(sends, 1);
  assert.equal((await Outbox.findById(recoverable._id)).status, "PROVIDER_ACCEPTED");
});

test("an expired job abandoned while processing becomes terminal after its lease", async () => {
  const now = new Date();
  const job = await Outbox.create({
    channel: "SMS", messageType: "AGENT_INVITATION", idempotencyKey: "expired-processing",
    businessReference: "agent:expired-processing", recipientPhone: "9800000001",
    recipientMasked: "******0001", body: "expired", status: "PROCESSING", attempts: 1,
    nextAttemptAt: new Date(0), expiresAt: new Date(now.getTime() - 60_000),
    leaseToken: "abandoned", leaseExpiresAt: new Date(now.getTime() - 1_000),
  });
  await recoverSmsNotifications({ OutboxModel: Outbox, now: () => now,
    send: async () => assert.fail("Expired processing message must not be sent") });
  assert.equal((await Outbox.findById(job._id)).status, "EXPIRED");
});
