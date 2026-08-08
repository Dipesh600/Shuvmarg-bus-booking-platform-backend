"use strict";

function buildDocumentAuditEvent({
  action,
  actor,
  slot,
  previousFleetApprovalStatus,
  resultingFleetApprovalStatus,
  reason = null,
  now = new Date(),
}) {
  const eventTypeMap = {
    UPLOADED: "FLEET_DOCUMENT_UPLOADED",
    REPLACED: "FLEET_DOCUMENT_REPLACED",
    RESUBMITTED: "FLEET_DOCUMENT_RESUBMITTED",
  };

  const eventType = slot === "fleetImages" && action !== "RESUBMITTED"
    ? "FLEET_IMAGES_UPDATED"
    : (eventTypeMap[action] || "FLEET_DOCUMENT_UPLOADED");

  return {
    eventType,
    actorType: actor.actorType,
    actorId: actor.actorId,
    documentSlot: slot,
    occurredAt: now,
    previousFleetApprovalStatus,
    resultingFleetApprovalStatus,
    action,
    reason: reason || null,
  };
}

module.exports = {
  buildDocumentAuditEvent,
};
