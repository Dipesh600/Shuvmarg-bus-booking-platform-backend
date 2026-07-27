"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createCouponOfferNotificationService,
} = require(
  "../../../../src/modules/coupon/admin/management/coupon-offer-notification.service"
);

test("offer notification remains scheduled, chunked, and non-returning", async () => {
  let scheduled;
  const pushes = [];
  const locals = [];
  const users = Array.from({ length: 101 }, (_, index) => ({
    _id: { toString: () => `u${index}` },
  }));
  const service = createCouponOfferNotificationService({
    User: { find: () => ({ lean: async () => users }) },
    UserDeviceInfo: {
      find: () => ({ lean: async () => [{ token: "fcm-1" }, { token: null }] }),
    },
    notificationManager: async (...args) => pushes.push(args),
    createLocalNotification: async (...args) => locals.push(args),
    scheduler: (callback) => {
      scheduled = callback;
    },
    console: { error() {} },
  });

  const result = service.sendOfferNotificationToPassengers(
    "SAVE10",
    "Save",
    "percentage",
    10
  );
  assert.equal(result, undefined);
  assert.equal(pushes.length, 0);
  await scheduled();
  assert.deepEqual(pushes[0], [
    ["fcm-1"],
    "🎉 New Offer: 10% OFF on your next trip!",
    "Use code SAVE10 — Save. Book now before it expires!",
  ]);
  assert.equal(locals.length, 101);
  assert.deepEqual(locals[0], [
    "u0",
    "COUPON_OFFER",
    "🎉 New Offer: 10% OFF on your next trip!",
    "Use code SAVE10 — Save. Book now before it expires!",
    { couponCode: "SAVE10" },
  ]);
});
