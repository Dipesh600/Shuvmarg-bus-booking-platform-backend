'use strict';

const { normalizePoint, validationError } = require(
  './passenger-esewa-checkout.policy'
);

const idOf = (value) => String(value?._id || value || '');

function normalizeConfiguredPoint(point) {
  if (typeof point === 'string') return { name: point.trim(), time: null };
  return {
    name: String(point?.name || point?.pointName || point?.location || '').trim(),
    time: String(point?.time || '').trim() || null,
    stopName: point?.stopName ? String(point.stopName) : null,
  };
}

function mapRegistryPoints(configEntries, timings, mode) {
  return (configEntries || []).flatMap((entry) => {
    const timing = (timings || []).find(
      (item) => idOf(item.stopId) === idOf(entry.stopId)
    );
    const behavior = timing?.stopBehavior || 'BOTH';
    const allowed = mode === 'boarding'
      ? ['BOARDING_ONLY', 'BOTH'].includes(behavior)
      : ['DROPPING_ONLY', 'BOTH'].includes(behavior);
    if (!allowed) return [];
    const time = mode === 'boarding'
      ? timing?.estimatedDeparture || timing?.estimatedArrival
      : timing?.estimatedArrival || timing?.estimatedDeparture;
    return (entry.boardingPointIds || [])
      .filter((point) =>
        !point?.type ||
        point.type === 'BOTH' ||
        point.type === (mode === 'boarding' ? 'BOARDING' : 'DROPPING')
      )
      .map((point) => ({
        name: point?.pointName,
        time: time || null,
        stopName: entry.stopId?.name || null,
      }));
  });
}

function resolveConfiguredCheckoutPoints(trip) {
  const legacy = trip?.busId?.boardingPointId;
  const config = trip?.scheduleId?.operatorRouteConfigId;
  const isReturn = trip?.variantId?.direction === 'RETURN';
  const entries = isReturn
    ? config?.returnBoardingConfig
    : config?.boardingConfig;
  const timings = isReturn ? config?.returnTimingConfig : config?.timingConfig;
  const registryBoarding = mapRegistryPoints(entries, timings, 'boarding');
  const registryDropping = mapRegistryPoints(entries, timings, 'dropping');

  return {
    boardingPoints: registryBoarding.length
      ? registryBoarding
      : legacy?.boardingPoints || [],
    droppingPoints: registryDropping.length
      ? registryDropping
      : legacy?.droppingPoints || [],
  };
}

function resolveCanonicalPoint(requestedPoint, configuredPoints, label) {
  const requested = normalizePoint(requestedPoint, label);
  const match = (configuredPoints || [])
    .map(normalizeConfiguredPoint)
    .find((point) =>
      point.name &&
      point.name.toLocaleLowerCase() === requested.name.toLocaleLowerCase()
    );
  if (!match) throw validationError(`${label} is not available for this trip.`);
  return match;
}

function resolveCanonicalBoardingSelection(requested, options, label) {
  if (!requested?.sourceType || !requested?.stopId) {
    throw validationError(`${label} selection is invalid.`);
  }
  const requestedLocationId = requested.boardingLocationId || null;
  const requestedAssignmentId = requested.assignmentId || null;
  const match = (options || []).find((option) =>
    option.sourceType === requested.sourceType &&
    idOf(option.stopId) === idOf(requested.stopId) &&
    idOf(option.boardingLocationId) === idOf(requestedLocationId) &&
    idOf(option.assignmentId) === idOf(requestedAssignmentId)
  );
  if (!match) throw validationError(`${label} is not available for this trip.`);
  return {
    sourceType: match.sourceType,
    stopId: match.stopId,
    boardingLocationId: match.boardingLocationId,
    assignmentId: match.assignmentId,
    name: match.name,
    canonicalName: match.canonicalName,
    stopName: match.stopName,
    landmark: match.landmark,
    address: match.address,
    reportingInstructions: match.reportingInstructions,
    time: match.time,
    lat: match.coordinates?.lat ?? null,
    lng: match.coordinates?.lng ?? null,
  };
}

function resolveCanonicalTripSnapshot(trip, boardingPoint, droppingPoint) {
  if (!trip) throw validationError('Trip details are unavailable.');
  const corridor = trip.variantId?.corridorId;
  const isReturn = trip.variantId?.direction === 'RETURN';
  const origin = corridor?.originId?.name;
  const destination = corridor?.destinationId?.name;
  const bookedFrom = boardingPoint?.stopName || trip.routeId?.from ||
    (isReturn ? destination : origin) || trip.fromStopName;
  const bookedTo = droppingPoint?.stopName || trip.routeId?.to ||
    (isReturn ? origin : destination) || trip.toStopName;
  const departure = boardingPoint?.time || trip.departureTime;
  const arrival = droppingPoint?.time || trip.arrivalTime;
  if (!bookedFrom || !bookedTo || !departure || !arrival) {
    throw validationError('Canonical trip details are incomplete.');
  }
  return {
    bookedFrom: String(bookedFrom),
    bookedTo: String(bookedTo),
    bookedDepartureTime: String(departure),
    bookedArrivalTime: String(arrival),
  };
}

module.exports = {
  resolveConfiguredCheckoutPoints,
  resolveCanonicalPoint,
  resolveCanonicalBoardingSelection,
  resolveCanonicalTripSnapshot,
};
