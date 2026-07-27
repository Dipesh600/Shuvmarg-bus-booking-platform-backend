"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createCouponMediaService,
} = require("../../../../src/modules/coupon/admin/management/coupon-media.service");

const imageKeyPolicy = require(
  "../../../../src/modules/coupon/admin/management/coupon-image-key.policy"
);

test("media upload preserves folder, raw key, and preview URL", async () => {
  const calls = [];
  const service = createCouponMediaService({
    buildS3Path: (input) => {
      calls.push(["path", input]);
      return "platform/coupons";
    },
    uploadFileToS3: async (...args) => {
      calls.push(["upload", ...args]);
      return "platform/coupons/a.jpg";
    },
    getDisplayUrl: async (key) => `signed:${key}`,
    deleteFromS3: async () => {},
    imageKeyPolicy,
  });
  assert.deepEqual(await service.upload({ name: "a.jpg" }), {
    objectKey: "platform/coupons/a.jpg",
    previewUrl: "signed:platform/coupons/a.jpg",
  });
  assert.deepEqual(calls, [
    ["path", { type: "coupon_image" }],
    ["upload", { name: "a.jpg" }, "platform/coupons"],
  ]);
});

test("orphan deletion rejects normalized traversal and preserves raw delete key", async () => {
  const deleted = [];
  const service = createCouponMediaService({
    buildS3Path() {},
    uploadFileToS3() {},
    getDisplayUrl() {},
    deleteFromS3: async (key) => deleted.push(key),
    imageKeyPolicy,
  });
  assert.deepEqual(
    await service.deleteOrphan("platform/coupons/../../owners/a.jpg"),
    { forbidden: true }
  );
  assert.deepEqual(await service.deleteOrphan("platform/coupons/a.jpg"), {
    forbidden: false,
  });
  assert.deepEqual(deleted, ["platform/coupons/a.jpg"]);
});
