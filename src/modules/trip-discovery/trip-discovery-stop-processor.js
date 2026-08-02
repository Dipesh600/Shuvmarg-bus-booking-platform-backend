const PLATFORM_DEFAULT_MIN_JOURNEY_MINS = 60;

async function processStopCandidates(originIds, destIds, repository) {
  let variantIds = [];
  const stopTimingMap = {};

  if (!originIds || originIds.length === 0 || !destIds || destIds.length === 0) {
    return { variantIds, stopTimingMap };
  }

  const { fwdCorridors, revCorridors } = await repository.findCorridors(originIds, destIds);
  const fwdCorridorIds = fwdCorridors.map(c => c._id);
  const revCorridorIds = revCorridors.map(c => c._id);

  const { fwdVariants, revVariants } = await repository.findVariants(fwdCorridorIds, revCorridorIds);
  variantIds = [...fwdVariants, ...revVariants].map(v => v._id);

  const { originRouteStops, destRouteStops } = await repository.findRouteStops(originIds, destIds);

  const destByVariant = {};
  for (const ds of destRouteStops) {
    const vid = ds.variantId.toString();
    if (!destByVariant[vid] || ds.sequence < destByVariant[vid].sequence) {
      destByVariant[vid] = ds;
    }
  }

  const rejectedVariants = new Set();

  for (const os of originRouteStops) {
    const vid = os.variantId.toString();
    const dst = destByVariant[vid];
    if (!dst || dst.sequence <= os.sequence) continue;

    if (!os.isMajor || !dst.isMajor) {
      rejectedVariants.add(vid);
      continue;
    }

    const journeyMins = (dst.estimatedMinutesFromOrigin || 0) - (os.estimatedMinutesFromOrigin || 0);
    if (journeyMins > 0 && journeyMins < PLATFORM_DEFAULT_MIN_JOURNEY_MINS) {
      rejectedVariants.add(vid);
      continue;
    }

    stopTimingMap[vid] = {
      originMins: os.estimatedMinutesFromOrigin || 0,
      destMins: dst.estimatedMinutesFromOrigin || 0,
    };
    if (variantIds.length === 0) variantIds.push(os.variantId);
  }

  variantIds = variantIds.filter(vid => !rejectedVariants.has(vid.toString()));

  if (variantIds.length > 0) {
    for (const v of [...fwdVariants, ...revVariants]) {
      const vid = v._id.toString();
      if (!stopTimingMap[vid] && !rejectedVariants.has(vid)) {
        const destRouteStop = destByVariant[vid];
        stopTimingMap[vid] = {
          originMins: 0,
          destMins: destRouteStop?.estimatedMinutesFromOrigin || 0,
        };
      }
    }
  }

  return { variantIds, stopTimingMap };
}

module.exports = {
  processStopCandidates,
};
