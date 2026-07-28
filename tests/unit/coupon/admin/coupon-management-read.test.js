"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createCouponReadService,
} = require("../../../../src/modules/coupon/admin/management/coupon-read.service");
const mapper = require(
  "../../../../src/modules/coupon/admin/management/coupon-read.mapper"
);
const imageKeyPolicy = require(
  "../../../../src/modules/coupon/admin/management/coupon-image-key.policy"
);

const makeService = (repository, getCouponStats = async () => []) =>
  createCouponReadService({
    repository,
    getCouponStats,
    getDisplayUrl: async (key) => `signed:${key}`,
    imageKeyPolicy,
    mapper,
    clock: () => new Date("2026-07-27T12:00:00Z"),
  });

test("empty list preserves exact 200 response and pagination", async () => {
  let query;
  const service = makeService({
    findPage: async (value) => {
      query = value;
      return [];
    },
    count: async () => 0,
  });
  const result = await service.list({ page: "2", limit: "10", status: "active" });
  assert.deepEqual(query, {
    isActive: true,
    validFrom: { $lte: new Date("2026-07-27T12:00:00Z") },
    validTo: { $gte: new Date("2026-07-27T12:00:00Z") },
  });
  assert.deepEqual(result, {
    statusCode: 200,
    body: {
      success: true,
      message: "No coupons found.",
      data: [],
      pagination: {
        currentPage: 2,
        totalPages: 0,
        totalCoupons: 0,
        hasNext: false,
        hasPrev: false,
      },
    },
  });
});

test("search overwrites expired status $or exactly as legacy behavior", async () => {
  let query;
  const service = makeService({
    findPage: async (value) => {
      query = value;
      return [];
    },
    count: async () => 0,
  });
  await service.list({ status: "expired", search: "SAVE" });
  assert.deepEqual(query.$or, [
    { couponCode: { $regex: "SAVE", $options: "i" } },
    { title: { $regex: "SAVE", $options: "i" } },
  ]);
  assert.equal(query.isActive, undefined);
});

test("coupon detail resolves image and default usage statistics", async () => {
  const coupon = {
    imageUrl: "https://bucket/platform/coupons/a.jpg",
    isCurrentlyValid: true,
    toObject: () => ({ _id: "c1", imageUrl: "platform/coupons/a.jpg" }),
  };
  const result = await makeService({
    findById: async () => coupon,
  }).getById("c1");
  assert.equal(result.body.data.imageUrlResolved, "signed:platform/coupons/a.jpg");
  assert.deepEqual(result.body.data.usageStats, {
    totalUsage: 0,
    totalDiscountGiven: 0,
    uniqueUsersCount: 0,
    averageDiscount: 0,
  });
});
