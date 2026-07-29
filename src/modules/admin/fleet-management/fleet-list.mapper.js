"use strict";

function mapSchedule(schedule) {
  if (!schedule) return null;
  return {
    departureTime: schedule.departureTime,
    arrivalTime: schedule.arrivalTime,
    operationalModel: schedule.operationalModel,
    hasReturn: !!schedule.returnScheduleId,
  };
}

function mapFleet(fleet, schedule) {
  return {
    _id: fleet._id,
    fleetId: fleet.fleetId,
    busNumber: fleet.busNumber,
    busName: fleet.busName,
    busType: fleet.busType,
    vehicleType: fleet.vehicleType,
    totalSeats: fleet.totalSeats || 0,
    operator: fleet.ownerId?.name || "N/A",
    status: fleet.status,
    approvalStatus: fleet.approvalStatus,
    setupComplete: fleet.setupComplete || false,
    approvedAt: fleet.approvedAt,
    brandId: fleet.brandId,
    corridor: fleet.corridorId
      ? {
          origin: fleet.corridorId.originId?.name || null,
          destination: fleet.corridorId.destinationId?.name || null,
          code: fleet.corridorId.code || null,
        }
      : null,
    schedule: mapSchedule(schedule),
  };
}

module.exports = { mapFleet };
