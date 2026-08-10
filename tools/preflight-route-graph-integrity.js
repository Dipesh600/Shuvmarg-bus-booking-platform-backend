"use strict";

function serializeId(value) {
  return value === null || value === undefined ? null : String(value);
}

function key(value) {
  return serializeId(value?._id || value);
}

function label(document, fallback = "unknown") {
  return document?.code || document?.name || document?.busNumber || fallback;
}

function pairKey(a, b) {
  const left = serializeId(a);
  const right = serializeId(b);
  return [left, right].sort().join("<->");
}

function push(issues, type, message, details = {}) {
  issues.push({ type, message, details });
}

function groupBy(items, field) {
  const map = new Map();
  for (const item of items) {
    const id = serializeId(item[field]);
    if (!id) continue;
    const list = map.get(id) || [];
    list.push(item);
    map.set(id, list);
  }
  return map;
}

function inspectRouteStopSequence(variant, routeStops, stopById, issues) {
  const variantId = key(variant);
  if (variant.status === "ACTIVE" && routeStops.length < 2) {
    push(issues, "ACTIVE_VARIANT_INCOMPLETE_SEQUENCE",
      "Active variant has fewer than two route stops.",
      { variantId, variantCode: variant.code, routeStopCount: routeStops.length });
  }
  const ordered = [...routeStops].sort((a, b) => Number(a.sequence) - Number(b.sequence));
  const seen = new Set();
  let previousSequence = 0;
  let previousMinutes = -Infinity;
  let previousDistance = -Infinity;
  for (const row of ordered) {
    const sequence = Number(row.sequence);
    const stop = stopById.get(serializeId(row.stopId));
    if (!Number.isSafeInteger(sequence) || sequence < 1) {
      push(issues, "INVALID_ROUTE_STOP_SEQUENCE",
        "Route stop sequence must be a positive integer.",
        { variantId, variantStatus: variant.status, routeStopId: key(row), sequence: row.sequence });
    }
    if (seen.has(sequence)) {
      push(issues, "DUPLICATE_ROUTE_STOP_SEQUENCE",
        "Variant has duplicate route-stop sequence values.",
        { variantId, variantStatus: variant.status, routeStopId: key(row), sequence });
    }
    seen.add(sequence);
    if (sequence !== previousSequence + 1) {
      push(issues, "NON_CONTIGUOUS_ROUTE_STOP_SEQUENCE",
        "Variant route-stop sequence has a gap.",
        { variantId, variantStatus: variant.status, routeStopId: key(row), sequence, expected: previousSequence + 1 });
    }
    previousSequence = sequence;
    if (!stop) {
      push(issues, "ROUTE_STOP_MISSING_STOP",
        "RouteStop references a missing Stop.",
        { variantId, variantStatus: variant.status, routeStopId: key(row), stopId: serializeId(row.stopId) });
    } else if (stop.status !== "ACTIVE" || stop.verificationStatus !== "VERIFIED" || stop.isRouteStop !== true) {
      push(issues, "ROUTE_STOP_INELIGIBLE_STOP",
        "RouteStop references a Stop that is not active, verified, and route-eligible.",
        {
          variantId, routeStopId: key(row), stopId: key(stop), stopCode: stop.code,
          variantStatus: variant.status,
          status: stop.status, verificationStatus: stop.verificationStatus,
          isRouteStop: stop.isRouteStop,
        });
    }
    const minutes = Number(row.estimatedMinutesFromOrigin || 0);
    const distance = Number(row.distanceFromOriginKm || 0);
    if (minutes < previousMinutes) {
      push(issues, "ROUTE_STOP_TIME_DECREASES",
        "Variant route-stop timing decreases later in the sequence.",
        { variantId, variantStatus: variant.status, routeStopId: key(row), sequence, minutes, previousMinutes });
    }
    if (distance < previousDistance) {
      push(issues, "ROUTE_STOP_DISTANCE_DECREASES",
        "Variant route-stop distance decreases later in the sequence.",
        { variantId, variantStatus: variant.status, routeStopId: key(row), sequence, distance, previousDistance });
    }
    previousMinutes = minutes;
    previousDistance = distance;
  }
  if (ordered.length > 0) {
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    if (variant.originTerminalStopId && serializeId(first.stopId) !== serializeId(variant.originTerminalStopId)) {
      push(issues, "VARIANT_ORIGIN_TERMINAL_MISMATCH",
        "Variant origin terminal does not match the first route stop.",
        { variantId, variantStatus: variant.status, firstStopId: serializeId(first.stopId), originTerminalStopId: serializeId(variant.originTerminalStopId) });
    }
    if (variant.destinationTerminalStopId && serializeId(last.stopId) !== serializeId(variant.destinationTerminalStopId)) {
      push(issues, "VARIANT_DESTINATION_TERMINAL_MISMATCH",
        "Variant destination terminal does not match the last route stop.",
        { variantId, variantStatus: variant.status, lastStopId: serializeId(last.stopId), destinationTerminalStopId: serializeId(variant.destinationTerminalStopId) });
    }
    if (variant.status === "ACTIVE" && (!variant.originTerminalStopId || !variant.destinationTerminalStopId)) {
      push(issues, "ACTIVE_VARIANT_MISSING_TERMINALS",
        "Active variant is missing reviewed physical terminal stops.",
        { variantId, variantCode: variant.code });
    }
  }
}

function inspectCorridors(corridors, variants, stopById, issues) {
  const pairMap = new Map();
  for (const corridor of corridors) {
    const origin = stopById.get(serializeId(corridor.originId));
    const destination = stopById.get(serializeId(corridor.destinationId));
    if (!origin || !destination) {
      push(issues, "CORRIDOR_MISSING_ENDPOINT",
        "Corridor references a missing endpoint Stop.",
        { corridorId: key(corridor), originId: serializeId(corridor.originId), destinationId: serializeId(corridor.destinationId) });
    }
    const neutral = pairKey(corridor.originId, corridor.destinationId);
    const matches = pairMap.get(neutral) || [];
    matches.push(corridor);
    pairMap.set(neutral, matches);
    const activeVariantCount = variants.filter((variant) =>
      serializeId(variant.corridorId) === key(corridor) && variant.status === "ACTIVE"
    ).length;
    if (corridor.status === "ACTIVE" && activeVariantCount === 0) {
      push(issues, "ACTIVE_CORRIDOR_WITHOUT_ACTIVE_VARIANT",
        "Active corridor has no active route variant.",
        { corridorId: key(corridor), corridorCode: corridor.code });
    }
  }
  for (const matches of pairMap.values()) {
    if (matches.length <= 1) continue;
    push(issues, "DIRECTION_NEUTRAL_CORRIDOR_DUPLICATE",
      "Multiple corridors represent the same direction-neutral endpoint pair.",
      { corridorIds: matches.map(key), corridorCodes: matches.map((item) => item.code) });
  }
}

function inspectOperatorConfigs(configs, variantById, issues) {
  for (const config of configs) {
    const variant = variantById.get(serializeId(config.variantId));
    if (!variant) {
      push(issues, "OPERATOR_CONFIG_MISSING_VARIANT",
        "Operator route config references a missing variant.",
        { configId: key(config), variantId: serializeId(config.variantId), status: config.status });
    } else if (config.status === "ACTIVE" && variant.status !== "ACTIVE") {
      push(issues, "ACTIVE_OPERATOR_CONFIG_NON_ACTIVE_VARIANT",
        "Active operator route config references a non-active variant.",
        { configId: key(config), variantId: key(variant), variantStatus: variant.status });
    }
  }
}

function inspectSchedules(schedules, variantById, configById, fleetById, issues) {
  for (const schedule of schedules) {
    const variant = variantById.get(serializeId(schedule.variantId));
    const config = configById.get(serializeId(schedule.operatorRouteConfigId));
    const fleet = fleetById.get(serializeId(schedule.busId));
    if (!variant) {
      push(issues, "SCHEDULE_MISSING_VARIANT",
        "Schedule references a missing variant.",
        { scheduleId: key(schedule), status: schedule.status, variantId: serializeId(schedule.variantId) });
    } else if (["ACTIVE", "SUSPENDED"].includes(schedule.status) && variant.status !== "ACTIVE") {
      push(issues, "LIVE_SCHEDULE_NON_ACTIVE_VARIANT",
        "Live schedule references a non-active variant.",
        { scheduleId: key(schedule), status: schedule.status, variantId: key(variant), variantStatus: variant.status });
    }
    if (!config) {
      push(issues, "SCHEDULE_MISSING_OPERATOR_CONFIG",
        "Schedule references a missing operator route config.",
        {
          scheduleId: key(schedule),
          status: schedule.status,
          operatorRouteConfigId: serializeId(schedule.operatorRouteConfigId),
        });
    } else if (["ACTIVE", "SUSPENDED"].includes(schedule.status) && config.status !== "ACTIVE") {
      push(issues, "LIVE_SCHEDULE_NON_ACTIVE_OPERATOR_CONFIG",
        "Live schedule references a non-active operator route config.",
        { scheduleId: key(schedule), configId: key(config), configStatus: config.status });
    }
    if (!fleet) {
      push(issues, "SCHEDULE_MISSING_FLEET",
        "Schedule references a missing fleet.",
        { scheduleId: key(schedule), busId: serializeId(schedule.busId), status: schedule.status });
    } else if (["ACTIVE", "SUSPENDED"].includes(schedule.status) &&
      (fleet.status !== "ACTIVE" || fleet.approvalStatus !== "APPROVED")) {
      push(issues, "LIVE_SCHEDULE_NON_OPERATIONAL_FLEET",
        "Live schedule references a fleet that is not approved and active.",
        { scheduleId: key(schedule), busId: key(fleet), status: fleet.status, approvalStatus: fleet.approvalStatus });
    }
  }
}

function inspectTrips(trips, variantById, scheduleById, fleetById, issues, now = new Date()) {
  for (const trip of trips) {
    const variant = variantById.get(serializeId(trip.variantId));
    const schedule = scheduleById.get(serializeId(trip.scheduleId));
    const fleet = fleetById.get(serializeId(trip.busId));
    const futureBookable = new Date(trip.tripDate) >= now &&
      ["scheduled", "boarding", "in-transit"].includes(trip.status);
    if (trip.variantId && !variant) {
      push(issues, "TRIP_MISSING_VARIANT",
        "Trip references a missing variant.",
        { tripId: key(trip), publicTripId: trip.tripId, variantId: serializeId(trip.variantId), status: trip.status });
    } else if (futureBookable && variant && variant.status !== "ACTIVE") {
      push(issues, "FUTURE_TRIP_NON_ACTIVE_VARIANT",
        "Future bookable trip references a non-active variant.",
        { tripId: key(trip), publicTripId: trip.tripId, variantId: key(variant), variantStatus: variant.status });
    }
    if (trip.scheduleId && !schedule) {
      push(issues, "TRIP_MISSING_SCHEDULE",
        "Trip references a missing schedule.",
        { tripId: key(trip), publicTripId: trip.tripId, scheduleId: serializeId(trip.scheduleId) });
    }
    if (!fleet) {
      push(issues, "TRIP_MISSING_FLEET",
        "Trip references a missing fleet.",
        { tripId: key(trip), publicTripId: trip.tripId, busId: serializeId(trip.busId) });
    }
  }
}

function summarizeIssues(issues) {
  const byType = {};
  for (const issue of issues) byType[issue.type] = (byType[issue.type] || 0) + 1;
  return byType;
}

function isLiveBlockingIssue(issue) {
  if (issue.type.startsWith("ACTIVE_")) return true;
  if (issue.type.startsWith("LIVE_")) return true;
  if (issue.type.startsWith("FUTURE_")) return true;
  if (issue.type.startsWith("OPERATOR_CONFIG_")) return true;
  if (issue.type.startsWith("TRIP_")) {
    return ["scheduled", "boarding", "in-transit"].includes(issue.details.status);
  }
  if (issue.type.startsWith("SCHEDULE_")) {
    return ["ACTIVE", "SUSPENDED"].includes(issue.details.status);
  }
  if ([
    "INVALID_ROUTE_STOP_SEQUENCE",
    "DUPLICATE_ROUTE_STOP_SEQUENCE",
    "NON_CONTIGUOUS_ROUTE_STOP_SEQUENCE",
    "ROUTE_STOP_MISSING_STOP",
    "ROUTE_STOP_INELIGIBLE_STOP",
    "ROUTE_STOP_TIME_DECREASES",
    "ROUTE_STOP_DISTANCE_DECREASES",
    "VARIANT_ORIGIN_TERMINAL_MISMATCH",
    "VARIANT_DESTINATION_TERMINAL_MISMATCH",
  ].includes(issue.type)) {
    return issue.details.variantStatus === "ACTIVE";
  }
  return false;
}

function classifyIssues(issues) {
  const liveBlockingIssues = [];
  const historicalHygieneIssues = [];
  for (const issue of issues) {
    if (isLiveBlockingIssue(issue)) liveBlockingIssues.push(issue);
    else historicalHygieneIssues.push(issue);
  }
  return { liveBlockingIssues, historicalHygieneIssues };
}

function incrementGroup(groups, type, keyValue, issue) {
  const groupKey = `${type}:${keyValue || "unknown"}`;
  const group = groups.get(groupKey) || {
    type,
    key: keyValue || null,
    count: 0,
    examples: [],
  };
  group.count += 1;
  if (group.examples.length < 5) group.examples.push(issue.details);
  groups.set(groupKey, group);
}

function summarizeIssueGroups(issues) {
  const groups = new Map();
  for (const issue of issues) {
    if (issue.type.endsWith("_MISSING_VARIANT")) {
      incrementGroup(groups, issue.type, issue.details.variantId, issue);
    } else if (issue.type.startsWith("TRIP_")) {
      incrementGroup(groups, issue.type, issue.details.scheduleId || issue.details.variantId, issue);
    } else if (issue.type.startsWith("SCHEDULE_")) {
      incrementGroup(groups, issue.type, issue.details.variantId || issue.details.operatorRouteConfigId || issue.details.busId, issue);
    } else if (issue.type.startsWith("ACTIVE_CORRIDOR_")) {
      incrementGroup(groups, issue.type, issue.details.corridorId, issue);
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

async function scanRouteGraphIntegrity(models, options = {}) {
  const [
    corridors, variants, routeStops, stops,
    configs, schedules, trips, fleets,
  ] = await Promise.all([
    models.RouteCorridor.find({}).select("_id code originId destinationId status").lean(),
    models.RouteVariant.find({}).select("_id code name corridorId status direction originTerminalStopId destinationTerminalStopId returnVariantId").lean(),
    models.RouteStop.find({}).select("_id variantId stopId sequence distanceFromOriginKm estimatedMinutesFromOrigin").lean(),
    models.Stop.find({}).select("_id code name status verificationStatus isRouteStop parentStopId").lean(),
    models.OperatorRouteConfig.find({}).select("_id variantId status brandId").lean(),
    models.Schedule.find({}).select("_id variantId operatorRouteConfigId busId status effectiveFrom effectiveUntil").lean(),
    models.Trip.find({}).select("_id tripId variantId scheduleId busId status tripDate").lean(),
    models.Fleet.find({}).select("_id busNumber status approvalStatus").lean(),
  ]);
  const issues = [];
  const stopById = new Map(stops.map((stop) => [key(stop), stop]));
  const variantById = new Map(variants.map((variant) => [key(variant), variant]));
  const configById = new Map(configs.map((config) => [key(config), config]));
  const fleetById = new Map(fleets.map((fleet) => [key(fleet), fleet]));
  const scheduleById = new Map(schedules.map((schedule) => [key(schedule), schedule]));
  const routeStopsByVariant = groupBy(routeStops, "variantId");

  inspectCorridors(corridors, variants, stopById, issues);
  for (const variant of variants) {
    const corridor = corridors.find((item) => key(item) === serializeId(variant.corridorId));
    if (!corridor) {
      push(issues, "VARIANT_MISSING_CORRIDOR",
        "Variant references a missing corridor.",
        { variantId: key(variant), variantCode: variant.code, corridorId: serializeId(variant.corridorId) });
    }
    inspectRouteStopSequence(variant, routeStopsByVariant.get(key(variant)) || [], stopById, issues);
  }
  inspectOperatorConfigs(configs, variantById, issues);
  inspectSchedules(schedules, variantById, configById, fleetById, issues);
  inspectTrips(trips, variantById, scheduleById, fleetById, issues, options.now || new Date());
  const { liveBlockingIssues, historicalHygieneIssues } = classifyIssues(issues);

  return {
    preflight: "route-graph-integrity",
    safeToOperate: issues.length === 0,
    safeForLiveOperations: liveBlockingIssues.length === 0,
    summary: {
      corridors: corridors.length,
      variants: variants.length,
      routeStops: routeStops.length,
      stops: stops.length,
      operatorRouteConfigs: configs.length,
      schedules: schedules.length,
      trips: trips.length,
      fleets: fleets.length,
      issueCount: issues.length,
      liveBlockingIssueCount: liveBlockingIssues.length,
      historicalHygieneIssueCount: historicalHygieneIssues.length,
      issueTypes: summarizeIssues(issues),
      liveBlockingIssueTypes: summarizeIssues(liveBlockingIssues),
      historicalHygieneIssueTypes: summarizeIssues(historicalHygieneIssues),
    },
    issueGroups: summarizeIssueGroups(issues),
    liveBlockingIssues,
    historicalHygieneIssues,
    issues,
  };
}

async function main() {
  require("dotenv").config();
  const summaryOnly = process.argv.includes("--summary");
  const mongoose = require("mongoose");
  const models = {
    RouteCorridor: require("../models/routeCorridorModel.js"),
    RouteVariant: require("../models/routeVariantModel.js"),
    RouteStop: require("../models/routeStopModel.js"),
    Stop: require("../models/stopModel.js"),
    OperatorRouteConfig: require("../models/operatorRouteConfigModel.js"),
    Schedule: require("../models/scheduleModel.js"),
    Trip: require("../models/tripModel.js"),
    Fleet: require("../models/fleetModel.js"),
  };
  const dbUrl = process.env.MONGODB_URL || process.env.DB_URL;
  if (!dbUrl) throw new Error("MONGODB_URL or DB_URL is required.");
  await mongoose.connect(dbUrl);
  try {
    const report = await scanRouteGraphIntegrity(models);
    const output = summaryOnly ? {
      preflight: report.preflight,
      safeToOperate: report.safeToOperate,
      safeForLiveOperations: report.safeForLiveOperations,
      summary: report.summary,
      issueGroups: report.issueGroups,
    } : report;
    console.log(JSON.stringify(output, null, 2));
    process.exitCode = report.safeToOperate ? 0 : 2;
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Route graph integrity preflight failed:", error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  classifyIssues,
  isLiveBlockingIssue,
  scanRouteGraphIntegrity,
  summarizeIssues,
};
