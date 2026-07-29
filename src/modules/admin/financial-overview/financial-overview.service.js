"use strict";

function createFinancialOverviewService({
  bookingRepository,
  settlementRepository,
  refundRepository,
  timePolicy,
  mapOverview,
  clock = {
    now: () => new Date(),
    timestamp: () => Date.now(),
  },
}) {
  return async function getFinancialOverview(months) {
    const window = timePolicy.createTimeWindow(months, clock.now());
    const [
      gbvThisMonth,
      gbvLastMonth,
      gbvAllTime,
      commissionPaid,
      commissionThisMonth,
      commissionLastMonth,
      pendingSettl,
      refundLiability,
      refundStats,
      bookingStatusDist,
      couponImpact,
      gatewayRaw,
      operatorLeaderboard,
      monthlyBookings,
      monthlyCommission,
      monthlyRefunds,
      settlementQueue,
      avgCommissionRate,
    ] = await Promise.all([
      bookingRepository.thisMonth(window.thisMonthStart),
      bookingRepository.lastMonth(
        window.lastMonthStart,
        window.lastMonthEnd
      ),
      bookingRepository.allTime(),
      settlementRepository.paidAllTime(),
      settlementRepository.paidThisMonth(window.thisMonthStart),
      settlementRepository.paidLastMonth(
        window.lastMonthStart,
        window.lastMonthEnd
      ),
      settlementRepository.pending(),
      refundRepository.liability(),
      refundRepository.statistics(),
      bookingRepository.statusDistribution(),
      bookingRepository.couponImpact(),
      bookingRepository.gatewayBreakdown(window.thisMonthStart),
      bookingRepository.operatorLeaderboard(window.thisMonthStart),
      bookingRepository.monthlyBookings(window.chartWindowStart),
      settlementRepository.monthly(window.chartWindowStart),
      refundRepository.monthly(window.chartWindowStart),
      settlementRepository.queue(),
      settlementRepository.averageRate(),
    ]);
    const totalBookingsCount = await bookingRepository.countAll();
    const cancelledCount = await bookingRepository.countCancelled();
    const data = {
      gbvThisMonth,
      gbvLastMonth,
      gbvAllTime,
      commissionPaid,
      commissionThisMonth,
      commissionLastMonth,
      pendingSettl,
      refundLiability,
      refundStats,
      bookingStatusDist,
      couponImpact,
      gatewayRaw,
      operatorLeaderboard,
      monthlyBookings,
      monthlyCommission,
      monthlyRefunds,
      settlementQueue,
      avgCommissionRate,
      totalBookingsCount,
      cancelledCount,
    };
    return mapOverview(data, window, clock.timestamp());
  };
}

module.exports = { createFinancialOverviewService };
