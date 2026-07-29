"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createCouponHistoryService,
} = require("../../../../src/modules/coupon/passenger/coupon-history.service");
const {
  createCouponSearchService,
} = require("../../../../src/modules/coupon/passenger/coupon-search.service");
const policy = require(
  "../../../../src/modules/coupon/passenger/passenger-coupon.policy"
);
const mapper = require(
  "../../../../src/modules/coupon/passenger/passenger-coupon.mapper"
);

test("history preserves mapping, savings, and pagination coercion", async () => {
  const usage = {
    _id: "h1",
    couponCode: "SAVE",
    couponId: { title: "Save" },
    bookingId: { ticketId: "T1" },
    discountAmount: 12.345,
    status: "applied",
    getSavingsPercentage: () => 5,
  };
  const calls = [];
  const service = createCouponHistoryService({
    repository: {
      findUsageHistory: async (...args) => {
        calls.push(args);
        return [usage];
      },
      countUsageHistory: async () => 21,
    },
    mapper,
  });
  const result = await service({ userId: "u1", page: "2", limit: "10" });
  assert.deepEqual(calls, [["u1", "2", "10"]]);
  assert.equal(result.body.data[0].savings, 5);
  assert.equal(result.body.summary.totalSavings, 12.35);
  assert.deepEqual(result.body.pagination, {
    currentPage: 2,
    totalPages: 3,
    totalRecords: 21,
    hasNext: true,
    hasPrev: true,
  });
});

test("search preserves query shape, sequential eligibility, and discount data", async () => {
  const dates = [
    new Date("2026-01-01T00:00:00Z"),
    new Date("2026-01-02T00:00:00Z"),
  ];
  let searchQuery;
  const coupons = [
    { _id: "c1", perUserLimit: 1 },
    {
      _id: "c2",
      couponCode: "SAVE",
      perUserLimit: 3,
      minOrderAmount: 100,
      calculateDiscount: () => 25,
    },
  ];
  const service = createCouponSearchService({
    repository: {
      searchCoupons: async (query) => {
        searchQuery = query;
        return coupons;
      },
      countSearchUsage: async (_user, id) => (id === "c1" ? 1 : 1),
    },
    policy,
    mapper,
    clock: () => dates.shift(),
  });
  const result = await service({
    userId: "u1",
    query: "sav",
    orderAmount: "500",
  });
  assert.equal(searchQuery.validFrom.$lte.toISOString(), "2026-01-01T00:00:00.000Z");
  assert.equal(searchQuery.validTo.$gte.toISOString(), "2026-01-02T00:00:00.000Z");
  assert.equal(result.body.data.length, 1);
  assert.equal(result.body.data[0].usageLeft, 2);
  assert.equal(result.body.data[0].finalAmount, 475);
  assert.equal(result.body.message, "Found 1 coupon(s) matching your search.");
});

test("invalid search stops before repository access", async () => {
  const service = createCouponSearchService({
    repository: { searchCoupons: async () => assert.fail("must not run") },
    policy,
    mapper,
    clock: () => new Date(),
  });
  assert.equal((await service({ query: "x" })).statusCode, 400);
});
