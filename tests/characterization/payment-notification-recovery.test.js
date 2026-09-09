"use strict";
const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const fixture = require("../helpers/security-cancellation-fixtures");
const Job = require("../../models/bookingNotificationJobModel");
const Cashback = require("../../models/bookingCashbackJobModel");
const Notification = require("../../models/localNotificationModel");
const Devices = require("../../models/userDeviceInfoModel");
const SmsOutbox = require("../../models/notificationOutboxModel");
const { withMongoTransaction } = require("../../src/shared/with-mongo-transaction");
const { recordBookingFollowups } = require("../../src/shared/record-booking-followups");
const { deliverBookingNotification, recoverBookingNotifications } = require("../../services/bookingNotificationRecovery");
const { deliverSmsNotification } = require("../../services/notificationOutboxRecovery");
let data;
before(async () => { await fixture.start(); await Promise.all([Job, Cashback, Notification, Devices, SmsOutbox].map(model => model.init())); });
after(fixture.stop);
beforeEach(async () => {
  data = await fixture.seed();
  await Promise.all([Job, Cashback, Notification, Devices, SmsOutbox].map(model => model.deleteMany({})));
  await withMongoTransaction(mongoose, null, session => recordBookingFollowups(data.booking, session));
  await Devices.collection.insertOne({ userId: data.booking.userId, token: "test-device-token" });
});
test("concurrent workers deliver one notification and preserve one in-app record", async () => {
  let sends = 0;
  const options = { send: async () => { sends++; return { success: true }; } };
  await Promise.all([recoverBookingNotifications(options), recoverBookingNotifications(options)]);
  assert.equal(sends, 1);
  assert.equal(await Notification.countDocuments({}), 1);
  assert.equal((await Job.findById(data.booking._id)).status, "COMPLETED");
});
test("booking commit records one durable ticket SMS without exposing its payload by default", async () => {
  const sms = await SmsOutbox.findOne({ businessReference: `booking:${data.booking._id}` });
  assert.equal(sms.messageType, "BOOKING_CONFIRMED");
  assert.equal(sms.status, "PENDING");
  assert.equal(sms.recipientPhone, undefined);
  assert.equal(await SmsOutbox.countDocuments({ businessReference: `booking:${data.booking._id}` }), 1);
});
test("cancelled bookings cannot emit a stale ticket-confirmation SMS", async () => {
  const sms = await SmsOutbox.findOne({ businessReference: `booking:${data.booking._id}` });
  await fixture.Booking.updateOne({ _id: data.booking._id }, { $set: { status: "cancelled" } });
  await deliverSmsNotification(sms._id, { send: async () => assert.fail("Cancelled booking must not send SMS") });
  assert.equal((await SmsOutbox.findById(sms._id)).status, "CANCELLED");
});
test("provider failure leaves a retryable job without duplicating the in-app notification", async () => {
  await deliverBookingNotification(data.booking._id, { send: async () => ({ success: false }) });
  assert.equal((await Job.findById(data.booking._id)).status, "PENDING");
  await Job.updateOne({ _id: data.booking._id }, { $set: { nextAttemptAt: new Date(0) } });
  await recoverBookingNotifications({ send: async () => ({ success: true }) });
  assert.equal((await Job.findById(data.booking._id)).status, "COMPLETED");
  assert.equal(await Notification.countDocuments({}), 1);
});
test("expired workers can be recovered and cancelled bookings skip confirmation push", async () => {
  await Job.updateOne({ _id: data.booking._id }, { $set: { status: "SENDING", leaseToken: "lost", leaseExpiresAt: new Date(0) } });
  await fixture.Booking.updateOne({ _id: data.booking._id }, { $set: { status: "cancelled" } });
  await recoverBookingNotifications({ send: async () => assert.fail("Cancelled booking must not be pushed") });
  assert.equal((await Job.findById(data.booking._id)).status, "SKIPPED");
});
test("removed device tokens do not keep repeating the confirmation", async () => {
  await deliverBookingNotification(data.booking._id, { send: async () => ({ success: true, response: {
    failureCount: 1, responses: [{ success: false, error: { code: "messaging/registration-token-not-registered" } }],
  } }) });
  assert.equal((await Job.findById(data.booking._id)).status, "COMPLETED");
});
test("transient per-device delivery failure remains retryable", async () => {
  await deliverBookingNotification(data.booking._id, { send: async () => ({ success: true, response: {
    failureCount: 1, responses: [{ success: false, error: { code: "messaging/server-unavailable" } }],
  } }) });
  assert.equal((await Job.findById(data.booking._id)).status, "PENDING");
});
test("failed booking commit rolls back all follow-up records", async () => {
  await Promise.all([Job, Cashback, Notification, SmsOutbox].map(model => model.deleteMany({})));
  await assert.rejects(() => withMongoTransaction(mongoose, null, async session => {
    await recordBookingFollowups(data.booking, session);
    throw new Error("injected failure");
  }), /injected/);
  for (const model of [Job, Cashback, Notification, SmsOutbox]) assert.equal(await model.countDocuments({}), 0);
});
