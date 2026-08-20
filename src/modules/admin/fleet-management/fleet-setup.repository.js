"use strict";

function createFleetSetupRepository({
  Bus,
  RouteVariant,
  OperatorRouteConfig,
  DriverProfile,
  Schedule,
}) {
  async function findFleet(id) {
    return Bus.findById(id)
      .select(
        "busName busNumber approvalStatus status setupComplete corridorId routeRequestId brandId"
      )
      .populate({
        path: "corridorId",
        select: "code originId destinationId",
        populate: [
          { path: "originId", select: "name" },
          { path: "destinationId", select: "name" },
        ],
      })
      .lean();
  }

  async function findRouteConfigs(fleet) {
    if (!fleet.brandId || !fleet.corridorId) return [];
    const variants = await RouteVariant.find({
      corridorId: fleet.corridorId._id,
    })
      .select("_id")
      .lean();
    const variantIds = variants.map((variant) => variant._id);
    if (variantIds.length === 0) return [];
    return OperatorRouteConfig.find({
      brandId: fleet.brandId,
      status: "ACTIVE",
      variantId: { $in: variantIds },
    })
      .populate({ path: "variantId", select: "name direction" })
      .select("_id activeStops status variantId")
      .lean();
  }

  async function findAssignedDriver(fleetId) {
    return DriverProfile.findOne({
      assignedBusId: fleetId,
      approvalStatus: "APPROVED",
    })
      .select("_id fullName licenseType")
      .lean();
  }

  function scheduleQuery(query) {
    return query
      .select(
        "_id status returnScheduleId departureTime arrivalTime operationalModel variantId"
      )
      .populate({ path: "variantId", select: "name direction" })
      .lean();
  }

  async function findSchedule(fleetId) {
    return scheduleQuery(Schedule.findOne({ busId: fleetId }));
  }

  async function findReturnSchedule(id) {
    return scheduleQuery(Schedule.findById(id));
  }

  return {
    findFleet,
    findRouteConfigs,
    findAssignedDriver,
    findSchedule,
    findReturnSchedule,
  };
}

module.exports = { createFleetSetupRepository };
