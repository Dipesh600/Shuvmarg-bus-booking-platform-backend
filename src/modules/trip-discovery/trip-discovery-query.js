function buildTripQuery(legacyRouteIds, variantIds, date, shift) {
  const tripQuery = {
    isActive: true,
    status: "scheduled",
    busId: { $ne: null },  // <<< GUARD: exclude trips with no fleet
    bookingClosesAt: { $gt: new Date() }, // <<< GUARD: Only trips that haven't closed booking
  };

  if (legacyRouteIds.length > 0 || variantIds.length > 0) {
    tripQuery.$or = [];
    if (legacyRouteIds.length > 0) tripQuery.$or.push({ routeId: { $in: legacyRouteIds } });
    if (variantIds.length > 0) tripQuery.$or.push({ variantId: { $in: variantIds } });
  }

  // Date filter — accepts both ISO string and Date
  if (date && date.trim() !== "") {
    const startOfDay = new Date(date.trim());
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(date.trim());
    endOfDay.setUTCHours(23, 59, 59, 999);
    tripQuery.tripDate = { $gte: startOfDay, $lte: endOfDay };
  }

  // Shift filter
  if (shift) {
    if (Array.isArray(shift)) {
      tripQuery.shift = { $in: shift };
    } else if (shift.toLowerCase() !== "both" && shift.trim() !== "") {
      tripQuery.shift = shift.trim().toLowerCase();
    }
  }

  return tripQuery;
}

module.exports = {
  buildTripQuery
};
