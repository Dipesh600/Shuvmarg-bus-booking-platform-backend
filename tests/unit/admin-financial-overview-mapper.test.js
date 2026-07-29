"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  mapFinancialOverview,
} = require("../../src/modules/admin/financial-overview/financial-overview.mapper");
const {
  createTimeWindow,
} = require("../../src/modules/admin/financial-overview/time-window.policy");

test("financial overview maps the legacy response surface", () => {
  const now = new Date(2026, 6, 29);
  const data = {
    gbvThisMonth: [{
      gbv: 1200, count: 3, seats: 5, discount: 40,
    }],
    gbvLastMonth: [{ gbv: 1000 }],
    gbvAllTime: [{
      gbv: 10000, count: 20, discount: 300, seats: 40,
      avgTicket: 500,
    }],
    commissionPaid: [{ total: 900, count: 4, grossPaid: 8000 }],
    commissionThisMonth: [{ total: 120 }],
    commissionLastMonth: [{ total: 100 }],
    pendingSettl: [{
      amount: 800, count: 2, pending: 1, processing: 1,
    }],
    refundLiability: [{ amount: 90, count: 1 }],
    refundStats: [{
      totalPaid: 250, totalPaidCount: 2, cancellationCharges: 30,
    }],
    bookingStatusDist: [{ _id: "booked", count: 18, value: 9000.4 }],
    couponImpact: [{
      couponBookings: 5, couponDiscount: 200, couponRevenue: 2500,
    }],
    gatewayRaw: [{
      _id: "esewa", count: 10, total: 6000, original: 6200,
      avgTicket: 600, thisMonth: 700,
    }],
    operatorLeaderboard: [{
      _id: "brand-1", brand: { brandName: "Road" }, gbv: 4000,
      count: 8, seats: 12, discount: 80, thisMonth: 500,
    }],
    monthlyBookings: [{
      _id: { year: 2026, month: 7 },
      gbv: 1200, bookings: 3, discount: 40,
    }],
    monthlyCommission: [{
      _id: { year: 2026, month: 7 }, commission: 120,
    }],
    monthlyRefunds: [{
      _id: { year: 2026, month: 7 }, refunds: 25,
    }],
    settlementQueue: [{
      _id: "s1",
      brandId: { brandName: "Road" },
      ownerId: { name: "Owner" },
      netPayableAmount: 900,
      platformCommission: 100,
      commissionRate: 0,
      grossAmount: 1000,
      totalTicketsSold: 4,
      status: "pending",
      raisedAt: new Date(2026, 6, 27),
    }],
    avgCommissionRate: [{ avgRate: 10 }],
    totalBookingsCount: 20,
    cancelledCount: 2,
  };
  const result = mapFinancialOverview(
    data,
    createTimeWindow(1, now),
    now.getTime()
  );
  assert.equal(result.gbv.momDelta, 20);
  assert.equal(result.takeRate.thisMonth, 10);
  assert.equal(result.transactionSuccessRate, 90);
  assert.deepEqual(result.bookingStatusDist.booked, {
    count: 18, value: 9000,
  });
  assert.equal(result.couponImpact.couponUsageRate, 25);
  assert.equal(result.operatorLeaderboard[0].share, 40);
  assert.equal(result.paymentBreakdown[0].volumeShare, 60);
  assert.deepEqual(result.monthlyChart, [{
    month: "Jul 26", gbv: 1200, commission: 120, refunds: 25,
    bookings: 3, discount: 40,
  }]);
  assert.equal(result.settlementQueue[0].commissionRate, 10);
  assert.equal(result.settlementQueue[0].daysAgo, 2);
  assert.deepEqual(result.revenue, {
    total: 10000, totalBookings: 20, totalDiscount: 300,
  });
  assert.deepEqual(result.commission, {
    totalCollected: 900, paidCount: 4,
  });
});
