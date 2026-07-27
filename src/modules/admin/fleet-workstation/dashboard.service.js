"use strict";

const createDashboardService = ({
  fleetRepository,
  tripRepository,
  scheduleService,
  bookingStatistics,
  financialService,
  timePolicy,
  clock = () => new Date(),
}) => {
  const getDashboard = async (id) => {
    const fleet = await fleetRepository.findFleet(id);
    if (!fleet) return null;
    const totalSeats = fleet.totalSeats || 0;
    const commissionRate = fleet.brandId?.commissionRate || 0;
    const { start: todayStart, end: todayEnd } = timePolicy.dayBounds(
      null,
      clock()
    );
    const todayTrip = await tripRepository.findToday(
      fleet._id,
      todayStart,
      todayEnd
    );
    const todayStats = todayTrip
      ? await bookingStatistics.aggregateTodayStats({
          tripIds: [todayTrip._id],
          totalSeats,
        })
      : null;
    const nextTrip = todayTrip
      ? null
      : await tripRepository.findNext(fleet._id, todayEnd);
    const schedules = await scheduleService.list(fleet._id, todayEnd);
    const dates = {
      todayEnd,
      thirtyDaysAgo: timePolicy.shiftUtcDays(clock(), -30),
      thirtyDaysAhead: timePolicy.shiftUtcDays(clock(), 30),
      sixtyDaysAhead: timePolicy.shiftUtcDays(clock(), 60),
    };
    const [upcomingTrips, completedTrips, cancelledTrips, recentTrips] =
      await tripRepository.findCategories(fleet._id, dates);
    await bookingStatistics.attachTripStats({
      tripGroups: [
        upcomingTrips,
        completedTrips,
        cancelledTrips,
        recentTrips,
      ],
      totalSeats,
    });
    const timelineTrips = await tripRepository.findTimeline(
      fleet._id,
      todayEnd,
      dates.sixtyDaysAhead
    );
    const financials = await financialService.summarize({
      busId: id,
      commissionRate,
      thisMonthStart: timePolicy.monthStart(0, clock()),
      lastMonthStart: timePolicy.monthStart(1, clock()),
    });
    const assignedDriver = await fleetRepository.findAssignedDriver(fleet._id);
    return {
      fleet,
      today: { trip: todayTrip, stats: todayStats, nextTrip },
      schedules,
      recentTrips,
      upcomingTrips,
      completedTrips,
      cancelledTrips,
      timelineTrips,
      financials,
      crew: { assignedDriver },
    };
  };
  return { getDashboard };
};

module.exports = { createDashboardService };
