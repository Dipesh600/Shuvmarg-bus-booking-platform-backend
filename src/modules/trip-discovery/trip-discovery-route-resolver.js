const { processStopCandidates } = require("./trip-discovery-stop-processor");

function _esc(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createRouteResolver({ repository }) {
  async function resolveRouteCandidates(from, to, identitySelection = null) {
    let legacyRouteIds = [];
    let variantIds = [];
    let resolvedFromName = from?.trim() || "";
    let resolvedToName = to?.trim() || "";
    let stopTimingMap = {};
    let originStopIds = new Set();
    let destStopIds = new Set();
    let selectedOriginStopId = null;
    let selectedDestinationStopId = null;

    if (identitySelection && identitySelection.isIdentityMode) {
      const { fromScope, toScope } = identitySelection;
      resolvedFromName = fromScope.canonicalName;
      resolvedToName = toScope.canonicalName;

      const originIds = fromScope.matchingStopIds;
      const destIds = toScope.matchingStopIds;

      originStopIds = new Set(originIds.map(id => id.toString()));
      destStopIds = new Set(destIds.map(id => id.toString()));
      selectedOriginStopId = fromScope.selectedStop._id.toString();
      selectedDestinationStopId = toScope.selectedStop._id.toString();

      const fromRegex = new RegExp(`^${_esc(resolvedFromName)}$`, 'i');
      const toRegex = new RegExp(`^${_esc(resolvedToName)}$`, 'i');
      const legacyRoutes = await repository.findLegacyRoutes(fromRegex, toRegex);
      legacyRouteIds = legacyRoutes.map(r => r._id);

      const processed = await processStopCandidates(originIds, destIds, repository);
      variantIds = processed.variantIds;
      stopTimingMap = processed.stopTimingMap;
    } else if (from && to) {
      const fromTrimmed = from.trim();
      const toTrimmed = to.trim();

      const fromRegex = new RegExp(`^${_esc(fromTrimmed)}$`, 'i');
      const toRegex = new RegExp(`^${_esc(toTrimmed)}$`, 'i');
      const legacyRoutes = await repository.findLegacyRoutes(fromRegex, toRegex);
      legacyRouteIds = legacyRoutes.map(r => r._id);

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
      if (originStops.length === 1) {
        selectedOriginStopId = originStops[0]._id.toString();
      }
      if (destStops.length === 1) {
        selectedDestinationStopId = destStops[0]._id.toString();
      }

      const originIds = originStops.map(s => s._id);
      const destIds = destStops.map(s => s._id);

      const processed = await processStopCandidates(originIds, destIds, repository);
      variantIds = processed.variantIds;
      stopTimingMap = processed.stopTimingMap;
    }

    return {
      legacyRouteIds,
      variantIds,
      resolvedFromName,
      resolvedToName,
      stopTimingMap,
      originStopIds,
      destStopIds,
      selectedOriginStopId,
      selectedDestinationStopId,
    };
  }

  return { resolveRouteCandidates };
}

module.exports = {
  createRouteResolver,
};
