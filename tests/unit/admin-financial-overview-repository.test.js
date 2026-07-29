"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createBookingFinancialRepository,
} = require("../../src/modules/admin/financial-overview/booking-financial.repository");
const {
  createSettlementFinancialRepository,
} = require("../../src/modules/admin/financial-overview/settlement-financial.repository");
const {
  createRefundFinancialRepository,
} = require("../../src/modules/admin/financial-overview/refund-financial.repository");

test("booking repository preserves eight aggregates and both counts", () => {
  const pipelines = [];
  const counts = [];
  const repository = createBookingFinancialRepository({
    Booking: {
      aggregate(pipeline) { pipelines.push(pipeline); return pipeline; },
      countDocuments(query) { counts.push(query); return 0; },
    },
  });
  const start = new Date(2026, 6, 1);
  const end = new Date(2026, 6, 31);
  repository.thisMonth(start);
  repository.lastMonth(start, end);
  repository.allTime();
  repository.statusDistribution();
  repository.couponImpact();
  repository.gatewayBreakdown(start);
  repository.operatorLeaderboard(start);
  repository.monthlyBookings(start);
  repository.countAll();
  repository.countCancelled();

  assert.equal(pipelines.length, 8);
  assert.deepEqual(pipelines[0][0], {
    $match: { status: "booked", createdAt: { $gte: start } },
  });
  assert.deepEqual(pipelines[1][0].$match.createdAt, {
    $gte: start, $lte: end,
  });
  assert.deepEqual(pipelines[4][0], {
    $match: { status: "booked", couponUsed: { $ne: null } },
  });
  assert.equal(pipelines[5][1].$group._id, "$gateway");
  assert.equal(pipelines[6][3].$limit, 8);
  assert.deepEqual(pipelines[6][4].$lookup, {
    from: "operatorbrands",
    localField: "_id",
    foreignField: "_id",
    as: "brand",
  });
  assert.deepEqual(counts, [{}, { status: "cancelled" }]);
});

test("settlement repository preserves analytics and queue query", () => {
  const pipelines = [];
  const chainCalls = [];
  const chain = {
    sort(value) { chainCalls.push(["sort", value]); return this; },
    limit(value) { chainCalls.push(["limit", value]); return this; },
    populate(...value) {
      chainCalls.push(["populate", ...value]);
      return this;
    },
    select(value) { chainCalls.push(["select", value]); return this; },
    lean() { chainCalls.push(["lean"]); return "queue"; },
  };
  const repository = createSettlementFinancialRepository({
    Settlement: {
      aggregate(pipeline) { pipelines.push(pipeline); return pipeline; },
      find(query) { chainCalls.push(["find", query]); return chain; },
    },
  });
  const start = new Date(2026, 6, 1);
  repository.paidAllTime();
  repository.paidThisMonth(start);
  repository.paidLastMonth(start, start);
  repository.pending();
  repository.monthly(start);
  assert.equal(repository.queue(), "queue");
  repository.averageRate();

  assert.equal(pipelines.length, 6);
  assert.deepEqual(pipelines[0][0], { $match: { status: "paid" } });
  assert.deepEqual(pipelines[3][0].$match.status, {
    $in: ["pending", "processing"],
  });
  assert.equal(pipelines[5][0].$group.avgRate.$avg, "$commissionRate");
  assert.deepEqual(chainCalls[0], ["find", {
    status: { $in: ["pending", "processing"] },
  }]);
  assert.deepEqual(chainCalls[1], ["sort", { raisedAt: 1 }]);
  assert.deepEqual(chainCalls[2], ["limit", 10]);
  assert.equal(chainCalls.at(-1)[0], "lean");
});

test("refund repository preserves liability, totals, and monthly queries", () => {
  const pipelines = [];
  const repository = createRefundFinancialRepository({
    Refund: {
      aggregate(pipeline) { pipelines.push(pipeline); return pipeline; },
    },
  });
  const start = new Date(2026, 6, 1);
  repository.liability();
  repository.statistics();
  repository.monthly(start);
  assert.equal(pipelines.length, 3);
  assert.deepEqual(pipelines[0][0].$match.status, {
    $in: ["pending", "processing"],
  });
  assert.ok(pipelines[1][0].$group.cancellationCharges);
  assert.deepEqual(pipelines[2][0], {
    $match: { status: "completed", createdAt: { $gte: start } },
  });
});
