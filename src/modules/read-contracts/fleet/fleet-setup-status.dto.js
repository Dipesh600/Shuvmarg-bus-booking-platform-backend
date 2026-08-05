"use strict";

function mapFleetSetupStatus(fleet, setupServiceResult = {}) {
  if (!fleet) return null;
  const fleetId = String(fleet._id || fleet.id);
  const fleetCode = fleet.fleetId || null;

  const isApproved = Boolean(fleet.isApproved || fleet.approvalStatus === "APPROVED");
  const hasSeatTemplate = Boolean(fleet.seatTemplateId);
  const hasRoute = Boolean(fleet.route?.from && fleet.route?.to);
  const isOperational = fleet.status === "active";

  const steps = [
    { step: 1, key: "verification", label: "Fleet Verification", complete: isApproved },
    { step: 2, key: "seat_layout", label: "Seat Layout Template", complete: hasSeatTemplate },
    { step: 3, key: "route_assignment", label: "Route Assignment", complete: hasRoute },
    { step: 4, key: "activation", label: "Fleet Activation", complete: isOperational },
  ];

  const completedCount = steps.filter((s) => s.complete).length;
  const setupComplete = Boolean(fleet.setupComplete || completedCount === steps.length);

  return {
    fleetId,
    fleetCode,
    setupComplete,
    progress: {
      completedSteps: completedCount,
      totalSteps: steps.length,
      percentage: Math.round((completedCount / steps.length) * 100),
    },
    steps,
    blockingReasons: setupServiceResult.blockingReasons || (setupComplete ? [] : steps.filter((s) => !s.complete).map((s) => `${s.label} incomplete`)),
  };
}

module.exports = {
  mapFleetSetupStatus,
};
