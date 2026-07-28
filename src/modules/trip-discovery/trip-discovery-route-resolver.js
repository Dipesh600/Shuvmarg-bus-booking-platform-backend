function _esc(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const PLATFORM_DEFAULT_MIN_JOURNEY_MINS = 60;

function createRouteResolver({ repository }) {
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
      const fromRegex = new RegExp(`^${_esc(fromTrimmed)}$`, 'i');
      const toRegex = new RegExp(`^${_esc(toTrimmed)}$`, 'i');
      const legacyRoutes = await repository.findLegacyRoutes(fromRegex, toRegex);
      legacyRouteIds = legacyRoutes.map(r => r._id);

      // ── Registry stop resolution ───────────────────────────────────────
      const fromStopRegex = new RegExp(`^${_esc(fromTrimmed)}$`, 'i');
      const toStopRegex = new RegExp(`^${_esc(toTrimmed)}$`, 'i');
      const [originStops, destStops] = await Promise.all([
        repository.findStopsByNameOrCode(fromStopRegex),
        repository.findStopsByNameOrCode(toStopRegex),
      ]);

      if (originStops.length > 0) resolvedFromName = originStops[0].name;
      if (destStops.length > 0) resolvedToName = destStops[0].name;

      originStopIds = new Set(originStops.map(s => s._id.toString()));
      destStopIds = new Set(destStops.map(s => s._id.toString()));

      if (originStops.length > 0 && destStops.length > 0) {
        const originIds = originStops.map(s => s._id);
        const destIds = destStops.map(s => s._id);

        // ── Strategy A: Direct corridor (A→B or B→A) ──────────────────
        const { fwdCorridors, revCorridors } = await repository.findCorridors(originIds, destIds);

        const fwdCorridorIds = fwdCorridors.map(c => c._id);
        const revCorridorIds = revCorridors.map(c => c._id);

        const { fwdVariants, revVariants } = await repository.findVariants(fwdCorridorIds, revCorridorIds);

        variantIds = [...fwdVariants, ...revVariants].map(v => v._id);

        // ── RouteStop fetch (always runs — used for timing AND journey validation) ───
        const { originRouteStops, destRouteStops } = await repository.findRouteStops(originIds, destIds);

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

  return { resolveRouteCandidates };
}

module.exports = {
  createRouteResolver
};
