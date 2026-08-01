function resolveStopTiming({ trip, originStopIds, destStopIds, timeToMins }) {
  let resolvedDepartureTime = trip.departureTime;
  let resolvedArrivalTime   = trip.arrivalTime;
  let resolvedOriginStopId = null;
  let resolvedDestinationStopId = null;
  let failsStopBehaviorGate = false;

  const operatorConfig = trip.scheduleId?.operatorRouteConfigId;
  const isReturnVariant = trip.variantId?.direction === "RETURN";
  const timingArray = operatorConfig
    ? (isReturnVariant
        ? (operatorConfig.returnTimingConfig || operatorConfig.timingConfig)
        : operatorConfig.timingConfig)
    : [];

  if (timingArray && timingArray.length > 0) {
    const fromEntry = timingArray.find(tc => originStopIds.has(tc.stopId?.toString()));
    const toEntry   = timingArray.find(tc => destStopIds.has(tc.stopId?.toString()));

    resolvedOriginStopId = fromEntry?.stopId?.toString() || null;
    resolvedDestinationStopId = toEntry?.stopId?.toString() || null;

    if (fromEntry) {
      const dep = (fromEntry.estimatedDeparture || "").trim();
      const arr = (fromEntry.estimatedArrival   || "").trim();
      if (dep) resolvedDepartureTime = dep;
      else if (arr) resolvedDepartureTime = arr;
    }

    if (toEntry) {
      const arr = (toEntry.estimatedArrival   || "").trim();
      const dep = (toEntry.estimatedDeparture || "").trim();
      if (arr) resolvedArrivalTime = arr;
      else if (dep) resolvedArrivalTime = dep;
    }

    if (fromEntry && !["BOARDING_ONLY", "BOTH"].includes(fromEntry.stopBehavior)) failsStopBehaviorGate = true;
    if (toEntry   && !["DROPPING_ONLY", "BOTH"].includes(toEntry.stopBehavior))   failsStopBehaviorGate = true;

    const operatorMin = operatorConfig?.minimumJourneyMinutes ?? 60;
    if (operatorMin > 0 && fromEntry?.estimatedDeparture && toEntry?.estimatedArrival) {
      const depMins  = timeToMins(fromEntry.estimatedDeparture);
      const arrMins  = timeToMins(toEntry.estimatedArrival);
      const fromDay  = fromEntry.dayOffset || 0;
      const toDay    = toEntry.dayOffset   || 0;
      let actualMins = (arrMins + toDay * 1440) - (depMins + fromDay * 1440);
      if (actualMins < 0) actualMins += 1440;
      if (actualMins < operatorMin) failsStopBehaviorGate = true;
    }
  }

  return {
    resolvedDepartureTime,
    resolvedArrivalTime,
    resolvedOriginStopId,
    resolvedDestinationStopId,
    failsStopBehaviorGate
  };
}

module.exports = {
  resolveStopTiming
};
