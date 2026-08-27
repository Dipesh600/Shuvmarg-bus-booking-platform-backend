'use strict';

const idOf = (value) => String(value?._id || value || '');
const nullableIdOf = (value) => (value ? idOf(value) : null);

const fareFor = (trip, fareRules) => fareRules.find((rule) => (
  idOf(rule.fleetId) === idOf(trip.busId)
  && idOf(rule.routeId) === idOf(trip.routeId)
)) || fareRules.find((rule) => (
  idOf(rule.fleetId) === idOf(trip.busId) && !rule.routeId
));

const toFare = (trip, rule) => ({
  baseFare: trip.tripFare ?? rule?.baseFare ?? null,
  seatClassPremium: {
    window: rule?.seatClassPremium?.window || 0,
    aisle: rule?.seatClassPremium?.aisle || 0,
    sleeper: rule?.seatClassPremium?.sleeper || 0,
  },
  advanceDiscount: {
    enabled: Boolean(rule?.advanceDiscount?.enabled),
    daysBeforeTravel: rule?.advanceDiscount?.daysBeforeTravel || null,
    discountPercent: rule?.advanceDiscount?.discountPercent || 0,
  },
  peakPricing: {
    enabled: Boolean(rule?.peakPricing?.enabled),
    surchargePercent: rule?.peakPricing?.surchargePercent || 0,
  },
});

const availabilityFor = (trip, availability = {}) => {
  const seatDoc = (availability.seatDocs || []).find((row) => (
    idOf(row.tripId) === idOf(trip._id)
  ));
  const held = new Set((availability.holds || [])
    .filter((row) => idOf(row.tripId) === idOf(trip._id))
    .flatMap((row) => row.seatNumbers || [])
    .map((seatNo) => String(seatNo).toLowerCase()));
  const seats = [
    ...(seatDoc?.seata || []),
    ...(seatDoc?.seatb || []),
    ...(seatDoc?.seatc || []),
  ];
  const availableSeatNumbers = seats.filter((seat) => (
    !seat.booked
    && (!seat.blockedFor || seat.blockedFor === 'none')
    && !held.has(String(seat.seatNo).toLowerCase())
  )).map((seat) => seat.seatNo);
  return {
    totalSeats: seats.length,
    availableCount: availableSeatNumbers.length,
    availableSeatNumbers,
  };
};

const toTrip = (trip, fareRules, availability) => ({
  tripId: idOf(trip._id),
  scheduleId: nullableIdOf(trip.scheduleId),
  bus: {
    id: idOf(trip.busId),
    name: trip.busId?.busName || null,
    number: trip.busId?.busNumber || null,
    busType: trip.busId?.busType || null,
    vehicleType: trip.busId?.vehicleType || null,
  },
  route: {
    id: nullableIdOf(trip.routeId),
    name: trip.routeId?.routeName || trip.directionLabel || null,
    from: trip.routeId?.from || trip.fromStopName || null,
    to: trip.routeId?.to || trip.toStopName || null,
    via: trip.routeId?.via || null,
  },
  tripDate: trip.tripDate,
  departureTime: trip.departureTime,
  arrivalTime: trip.arrivalTime,
  shift: trip.shift,
  status: trip.status,
  fare: toFare(trip, fareFor(trip, fareRules)),
  availability: availabilityFor(trip, availability),
});

const toResponse = ({ groups, kycStatus, kycCleared, page, limit }) => ({
  success: true,
  data: {
    kycStatus,
    kycCleared,
    inventory: groups.map(({ assignment, trips, fareRules, availability, hasMore }) => ({
      brand: {
        id: idOf(assignment.operatorId),
        brandName: assignment.operatorId?.brandName || null,
      },
      trips: trips.map((trip) => toTrip(trip, fareRules, availability)),
      pagination: { page, limit, hasMore },
    })),
  },
});

module.exports = { toResponse };
