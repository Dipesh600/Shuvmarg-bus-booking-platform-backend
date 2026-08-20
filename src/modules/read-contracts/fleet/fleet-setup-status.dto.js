"use strict";

function mapFleetSetupStatus(canonicalData) {
  if (!canonicalData) return null;

  const steps = canonicalData.steps || {};

  const stepItems = [
    { key: "routeAssigned", label: "Route Assignment", complete: Boolean(steps.routeAssigned) },
    { key: "routeConfigured", label: "Route Configuration", complete: Boolean(steps.routeConfigured) },
    { key: "driverAssigned", label: "Driver Assignment", complete: Boolean(steps.driverAssigned) },
    { key: "scheduleCreated", label: "Schedule Creation", complete: Boolean(steps.scheduleCreated) },
    { key: "activated", label: "Fleet Activation", complete: Boolean(steps.activated) },
  ];

  const completedCount = stepItems.filter((s) => s.complete).length;
  const totalCount = stepItems.length;
  const percentage = Math.round((completedCount / totalCount) * 100);

  const blockingReasons = stepItems
    .filter((s) => !s.complete)
    .map((s) => `${s.label} incomplete`);

  return {
    fleetId: String(canonicalData.fleetId || ""),
    busName: canonicalData.busName || null,
    busNumber: canonicalData.busNumber || null,
    approvalStatus: canonicalData.approvalStatus || null,
    setupComplete: Boolean(steps.activated),
    nextStep: canonicalData.nextStep || "complete",
    isFullyOperational: Boolean(canonicalData.isFullyOperational || steps.activated),
    steps,
    stepDetails: stepItems,
    progress: {
      completedSteps: completedCount,
      totalSteps: totalCount,
      percentage,
    },
    blockingReasons,
    scheduleId: canonicalData.scheduleId || null,
    returnScheduleId: canonicalData.returnScheduleId || null,
    assignedCorridor: canonicalData.assignedCorridor || null,
    assignedRouteConfigs: canonicalData.assignedRouteConfigs || [],
    assignedDriver: canonicalData.assignedDriver || null,
    outboundScheduleData: canonicalData.outboundScheduleData || null,
    returnScheduleData: canonicalData.returnScheduleData || null,
  };
}

module.exports = {
  mapFleetSetupStatus,
};
