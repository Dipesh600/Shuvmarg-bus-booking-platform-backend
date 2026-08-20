"use strict";

function nextSetupStep(steps) {
  if (!steps.routeAssigned) return "routeAssigned";
  if (!steps.routeConfigured) return "routeConfigured";
  if (!steps.driverAssigned) return "driverAssigned";
  if (!steps.scheduleCreated) return "scheduleCreated";
  if (!steps.activated) return "activated";
  return "complete";
}

function createFleetSetupService({ repository }) {
  return async function getFleetSetupStatus(id) {
    const fleet = await repository.findFleet(id);
    if (!fleet) {
      return {
        statusCode: 404,
        body: { success: false, message: "Fleet not found." },
      };
    }

    const routeConfigs = await repository.findRouteConfigs(fleet);
    const assignedDriver = await repository.findAssignedDriver(fleet._id);
    const schedule = await repository.findSchedule(fleet._id);
    let returnSchedule = null;
    if (schedule?.returnScheduleId) {
      returnSchedule = await repository.findReturnSchedule(
        schedule.returnScheduleId
      );
    }

    const steps = {
      routeAssigned: !!fleet.corridorId,
      routeConfigured: routeConfigs.length > 0,
      driverAssigned: !!assignedDriver,
      scheduleCreated: !!schedule,
      returnTripLinked: !!schedule?.returnScheduleId,
      activated:
        Boolean(fleet.setupComplete) &&
        (schedule?.status === "ACTIVE" || returnSchedule?.status === "ACTIVE"),
    };

    return {
      statusCode: 200,
      body: {
        success: true,
        data: {
          fleetId: fleet._id,
          busName: fleet.busName,
          busNumber: fleet.busNumber,
          approvalStatus: fleet.approvalStatus,
          steps,
          nextStep: nextSetupStep(steps),
          isFullyOperational: steps.activated,
          scheduleId: schedule?._id || null,
          returnScheduleId: schedule?.returnScheduleId || null,
          assignedCorridor: fleet.corridorId || null,
          assignedRouteConfigs: routeConfigs,
          assignedDriver,
          outboundScheduleData: schedule || null,
          returnScheduleData: returnSchedule,
        },
      },
    };
  };
}

module.exports = { createFleetSetupService, nextSetupStep };
