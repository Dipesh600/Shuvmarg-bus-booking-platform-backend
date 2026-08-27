'use strict';

const idOf = (value) => String(value?._id || value || '');

const fareFor = (schedule, fareRules) => fareRules.find((rule) => (
  idOf(rule.fleetId) === idOf(schedule.busId)
  && idOf(rule.routeId) === idOf(schedule.busRouteId)
)) || fareRules.find((rule) => (
  idOf(rule.fleetId) === idOf(schedule.busId) && !rule.routeId
));

const toFare = (rule) => (rule ? {
  baseFare: rule.baseFare,
  seatClassPremium: {
    window: rule.seatClassPremium?.window || 0,
    aisle: rule.seatClassPremium?.aisle || 0,
    sleeper: rule.seatClassPremium?.sleeper || 0,
  },
  advanceDiscount: {
    enabled: Boolean(rule.advanceDiscount?.enabled),
    daysBeforeTravel: rule.advanceDiscount?.daysBeforeTravel || null,
    discountPercent: rule.advanceDiscount?.discountPercent || 0,
  },
  peakPricing: {
    enabled: Boolean(rule.peakPricing?.enabled),
    surchargePercent: rule.peakPricing?.surchargePercent || 0,
  },
} : null);

const toSchedule = (schedule, fareRules) => ({
  scheduleId: idOf(schedule._id),
  bus: {
    id: idOf(schedule.busId),
    name: schedule.busId?.busName || null,
    number: schedule.busId?.busNumber || null,
    busType: schedule.busId?.busType || null,
    vehicleType: schedule.busId?.vehicleType || null,
  },
  route: {
    id: idOf(schedule.routeId),
    name: schedule.routeId?.name || null,
    serviceId: idOf(schedule.busRouteId),
    serviceName: schedule.busRouteId?.routeName || null,
    from: schedule.busRouteId?.from || null,
    to: schedule.busRouteId?.to || null,
    via: schedule.busRouteId?.via || null,
  },
  date: schedule.date,
  departureTime: schedule.departureTime,
  arrivalTime: schedule.arrivalTime,
  totalTimeTaken: schedule.totalTimeTaken,
  shift: schedule.shift,
  yatraPoints: schedule.yatrapoints || 0,
  fare: toFare(fareFor(schedule, fareRules)),
});

const toResponse = ({ groups, kycStatus, kycCleared, page, limit }) => ({
  success: true,
  data: {
    kycStatus,
    kycCleared,
    inventory: groups.map(({ assignment, schedules, fareRules, hasMore }) => ({
      brand: {
        id: idOf(assignment.operatorId),
        brandName: assignment.operatorId?.brandName || null,
      },
      schedules: schedules.map((schedule) => toSchedule(schedule, fareRules)),
      pagination: { page, limit, hasMore },
    })),
  },
});

module.exports = { toResponse };
