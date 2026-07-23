const BusRoute = require("../../models/busRouteModel");
const Stop = require("../../models/stopModel");
const RouteCorridor = require("../../models/routeCorridorModel");
const RouteVariant = require("../../models/routeVariantModel");
const RouteStop = require("../../models/routeStopModel");

function _esc(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const PLATFORM_DEFAULT_MIN_JOURNEY_MINS = 60;

async function resolveRouteCandidates(from, to) {
  let legacyRouteIds = [];
  let variantIds = [];
  let resolvedFromName = from?.trim() || "";
  let resolvedToName = to?.trim() || "";
  const stopTimingMap = {};
  let originStopIds = new Set();
  let destStopIds = new Set();

  if (from && to) {
    const fromTrimmed = from.trim();
    const toTrimmed = to.trim();

    // ── Legacy BusRoute lookup (both directions) ───────────────────────
    const [fwdRoutes, revRoutes] = await Promise.all([
      BusRoute.find({ from: new RegExp(`^${_esc(fromTrimmed)}$`, 'i'), to: new RegExp(`^${_esc(toTrimmed)}$`, 'i'), status: "ACTIVE" }),
      BusRoute.find({ from: new RegExp(`^${_esc(toTrimmed)}$`, 'i'), to: new RegExp(`^${_esc(fromTrimmed)}$`, 'i'), status: "ACTIVE" }),
    ]);
    legacyRouteIds = [...fwdRoutes, ...revRoutes].map(r => r._id);

    // ── Registry stop resolution ───────────────────────────────────────
    const nameOrCodeFilter = (val) => ({
      $or: [
        { name: new RegExp(`^${_esc(val)}$`, 'i') },
        { code: new RegExp(`^${_esc(val)}$`, 'i') },
      ],
      status: "ACTIVE",
    });

    const [originStops, destStops] = await Promise.all([
      Stop.find(nameOrCodeFilter(fromTrimmed)).select("_id name").lean(),
      Stop.find(nameOrCodeFilter(toTrimmed)).select("_id name").lean(),
    ]);

    if (originStops.length > 0) resolvedFromName = originStops[0].name;
    if (destStops.length > 0) resolvedToName = destStops[0].name;

    originStopIds = new Set(originStops.map(s => s._id.toString()));
    destStopIds = new Set(destStops.map(s => s._id.toString()));

    if (originStops.length > 0 && destStops.length > 0) {
      const originIds = originStops.map(s => s._id);
      const destIds = destStops.map(s => s._id);

      // ── Strategy A: Direct corridor (A→B or B→A) ──────────────────
      const [fwdCorridors, revCorridors] = await Promise.all([
        RouteCorridor.find({ originId: { $in: originIds }, destinationId: { $in: destIds }, status: "ACTIVE" }).lean(),
        RouteCorridor.find({ originId: { $in: destIds },  destinationId: { $in: originIds }, status: "ACTIVE" }).lean(),
      ]);

      const [fwdVariants, revVariants] = await Promise.all([
        fwdCorridors.length > 0
          ? RouteVariant.find({ corridorId: { $in: fwdCorridors.map(c => c._id) }, direction: "FORWARD", status: "ACTIVE" }).lean()
          : Promise.resolve([]),
        revCorridors.length > 0
          ? RouteVariant.find({ corridorId: { $in: revCorridors.map(c => c._id) }, direction: "RETURN",  status: "ACTIVE" }).lean()
          : Promise.resolve([]),
      ]);

      variantIds = [...fwdVariants, ...revVariants].map(v => v._id);

      // ── RouteStop fetch (always runs — used for timing AND journey validation) ───
      const [originRouteStops, destRouteStops] = await Promise.all([
        RouteStop.find({ stopId: { $in: originIds } }).select("variantId sequence estimatedMinutesFromOrigin isMajor").lean(),
        RouteStop.find({ stopId: { $in: destIds   } }).select("variantId sequence estimatedMinutesFromOrigin isMajor").lean(),
      ]);

      // Group dest stops by variantId for O(1) lookup
      const destByVariant = {};
      for (const ds of destRouteStops) {
        const vid = ds.variantId.toString();
        if (!destByVariant[vid] || ds.sequence < destByVariant[vid].sequence) {
          destByVariant[vid] = ds;
        }
      }

      const rejectedVariants = new Set(); // variants that fail any gate

      for (const os of originRouteStops) {
        const vid = os.variantId.toString();
        const dst = destByVariant[vid];
        if (!dst || dst.sequence <= os.sequence) continue;

        // ─ GATE 1: Both stops must be major ──────────────────────────────
        if (!os.isMajor || !dst.isMajor) {
          rejectedVariants.add(vid);
          continue;
        }

        // ─ GATE 2: Minimum journey time ───────────────────────────────────
        const journeyMins = (dst.estimatedMinutesFromOrigin || 0) - (os.estimatedMinutesFromOrigin || 0);
        if (journeyMins > 0 && journeyMins < PLATFORM_DEFAULT_MIN_JOURNEY_MINS) {
          rejectedVariants.add(vid);
          continue;
        }

        // ─ Passed all platform-level gates → record timing data ───────────
        stopTimingMap[vid] = {
          originMins: os.estimatedMinutesFromOrigin || 0,
          destMins:   dst.estimatedMinutesFromOrigin || 0,
        };
        // If Strategy A found no direct corridor variants, this is intermediate
        if (variantIds.length === 0) variantIds.push(os.variantId);
      }

      // Remove rejected variants from the candidate set
      variantIds = variantIds.filter(vid => !rejectedVariants.has(vid.toString()));

      // Fill stopTimingMap for Strategy A direct-corridor variants that passed
      if (variantIds.length > 0) {
        for (const v of [...fwdVariants, ...revVariants]) {
          const vid = v._id.toString();
          if (!stopTimingMap[vid] && !rejectedVariants.has(vid)) {
            const destRouteStop = destByVariant[vid];
            stopTimingMap[vid] = {
              originMins: 0,
              destMins:   destRouteStop?.estimatedMinutesFromOrigin || 0,
            };
          }
        }
      }
    }
  }

  return {
    legacyRouteIds,
    variantIds,
    resolvedFromName,
    resolvedToName,
    stopTimingMap,
    originStopIds,
    destStopIds
  };
}

module.exports = {
  resolveRouteCandidates
};
