"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const sms = require("../../../src/modules/notifications/outbox/booking-sms.service");

const booking = { _id: "booking-1", ticketId: "SM-123", userId: "user-1",
  brandId: "brand-1", bookedFrom: "Kathmandu", bookedTo: "Pokhara" };
const refund = { _id: "refund-1", userId: "user-1", refundAmount: 850,
  destination: "wallet", refundGateway: "yatra_balance", status: "completed" };

test("booking confirmation uses a stable key and safe ticket context", async () => {
  let input;
  await sms.enqueueBookingConfirmed({ booking, phone: "9800000001" }, {
    outbox: { enqueueSms: async value => { input = value; return value; } },
  });
  assert.equal(input.idempotencyKey, "booking:booking-1:confirmed:1");
  assert.match(input.body, /SM-123/);
  assert.doesNotMatch(input.body, /password|otp|pin/i);
});

test("cancellation cancels an unsent confirmation and records refund status separately", async () => {
  const calls = [];
  const outbox = {
    cancelPendingSms: async reference => calls.push(["cancel", reference]),
    enqueueSms: async input => { calls.push([input.messageType, input.idempotencyKey]); return input; },
  };
  await sms.enqueueBookingCancelled({ booking, refund, phone: "9800000001" }, { outbox });
  assert.deepEqual(calls, [
    ["cancel", "booking:booking-1"],
    ["BOOKING_CANCELLED", "booking:booking-1:cancelled:1"],
    ["REFUND_STATUS", "refund:refund-1:status:completed:destination:wallet"],
  ]);
  assert.match(sms.refundBody({ booking, refund }), /SM Money/);
});

test("refund destination creates a distinct status message and malformed legacy phones do not block booking", async () => {
  const keys = [];
  const outbox = {
    enqueueSms: async input => {
      if (input.recipientPhone === "bad") {
        throw Object.assign(new Error("invalid"), { code: "INVALID_SMS_RECIPIENT" });
      }
      keys.push(input.idempotencyKey);
      return input;
    },
  };
  const pending = { ...refund, status: "pending", destination: null };
  await sms.enqueueRefundStatus({ booking, refund: pending, phone: "9800000001" }, { outbox });
  await sms.enqueueRefundStatus({ booking, refund: { ...pending, destination: "original" },
    phone: "9800000001" }, { outbox });
  assert.notEqual(keys[0], keys[1]);
  assert.equal(await sms.enqueueBookingConfirmed({ booking, phone: "bad" }, { outbox }), null);
});
