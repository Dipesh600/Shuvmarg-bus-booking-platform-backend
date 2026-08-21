"use strict";

const policy = require("./seat-layout-persistence.policy");
const { SeatLayoutPersistenceError } = require("./seat-layout-persistence.error");
const { validateSeatLayoutV3, seatLayoutV3Fingerprint } = require("../../domain/seat-layout-v3");
const { isLegacyOverallRejection } = require("../fleet-management/fleet-review-state");

function sameId(first, second) {
  return String(first) === String(second);
}

function createFleetSeatLayoutService(repository) {
  async function loadPublishedRevision(revisionId) {
    const revision = policy.requireRecord(
      await repository.findRevision(revisionId), "SEAT_LAYOUT_REVISION_NOT_FOUND", "Seat-layout revision not found."
    );
    if (revision.status !== "PUBLISHED") {
      throw new SeatLayoutPersistenceError(
        "SEAT_LAYOUT_REVISION_NOT_PUBLISHED", "Only a published layout revision can be assigned to a fleet."
      );
    }
    return revision;
  }

  async function assertFleetAccess(fleetId, actor) {
    policy.assertActor(actor);
    const fleet = policy.requireRecord(
      await repository.findFleet(fleetId), "FLEET_NOT_FOUND", "Fleet not found."
    );
    if (actor.type === "BUS_OWNER" && !sameId(fleet.ownerId, actor.id)) {
      throw new SeatLayoutPersistenceError("FLEET_LAYOUT_FORBIDDEN", "This fleet belongs to another owner.", 403);
    }
    return fleet;
  }

  async function assertTemplateAccess(fleet, revision) {
    const template = policy.requireRecord(
      await repository.findTemplate(revision.templateId),
      "SEAT_LAYOUT_TEMPLATE_NOT_FOUND", "Seat-layout template not found."
    );
    if (template.status !== "ACTIVE") {
      throw new SeatLayoutPersistenceError("SEAT_LAYOUT_TEMPLATE_ARCHIVED", "Archived templates cannot be assigned.");
    }
    if (template.scope !== "OPERATOR") {
      throw new SeatLayoutPersistenceError(
        "FLEET_LAYOUT_OPERATOR_TEMPLATE_REQUIRED",
        "Adopt the platform template into the operator library before assigning it to a fleet."
      );
    }
    if (!sameId(template.ownerId, fleet.ownerId)) {
      throw new SeatLayoutPersistenceError(
        "SEAT_LAYOUT_TEMPLATE_OWNER_MISMATCH", "The operator template belongs to another owner."
      );
    }
    return template;
  }

  async function assignInitial(fleetId, revisionId, actor) {
    const fleet = await assertFleetAccess(fleetId, actor);
    const revision = await loadPublishedRevision(revisionId);
    const template = await assertTemplateAccess(fleet, revision);
    return repository.createInitialAssignment({ fleet, template, revision, actor });
  }

  async function createInitialCustomLayout(fleetId, input, actor) {
    const fleet = await assertFleetAccess(fleetId, actor);
    if (!["DRAFT", "REJECTED"].includes(fleet.approvalStatus)) {
      throw new SeatLayoutPersistenceError("FLEET_LAYOUT_INITIAL_LOCKED", "A custom initial layout can only be created while the fleet is a draft.", 409);
    }
    if (await repository.findAssignment(fleetId)) {
      throw new SeatLayoutPersistenceError("FLEET_LAYOUT_ALREADY_ASSIGNED", "This fleet already has a seat layout.", 409);
    }
    const name = typeof input?.name === "string" ? input.name.trim() : "";
    if (name.length < 2 || name.length > 120) {
      throw new SeatLayoutPersistenceError("SEAT_LAYOUT_INPUT_INVALID", "Layout name must contain 2 to 120 characters.", 422);
    }
    const validated = validateSeatLayoutV3(input?.layout);
    let sourceTemplate = null;
    if (input?.sourceTemplateId) {
      sourceTemplate = policy.requireRecord(await repository.findTemplate(input.sourceTemplateId), "SEAT_LAYOUT_TEMPLATE_NOT_FOUND", "Source seat-layout template not found.");
      const accessiblePlatform = sourceTemplate.scope === "PLATFORM" && sourceTemplate.status === "ACTIVE";
      const accessibleOwner = sourceTemplate.scope === "OPERATOR" && sameId(sourceTemplate.ownerId, actor.id);
      if (!accessiblePlatform && !accessibleOwner) throw new SeatLayoutPersistenceError("SEAT_LAYOUT_SOURCE_FORBIDDEN", "The source layout is not available to this operator.", 403);
    }
    return repository.createInitialCustomLayout({
      fleet, sourceTemplate, name, layout: validated.layout, totalPlaces: validated.totalPlaces,
      physicalFingerprint: seatLayoutV3Fingerprint(validated.layout), actor,
    });
  }

  async function requestChange(fleetId, proposedRevisionId, actor) {
    const fleet = await assertFleetAccess(fleetId, actor);
    if (
      actor.type === "BUS_OWNER" &&
      fleet.approvalStatus === "REJECTED" &&
      !isLegacyOverallRejection(fleet) &&
      fleet.sectionReviews?.seatLayout?.status !== "rejected"
    ) {
      throw new SeatLayoutPersistenceError(
        "FLEET_LAYOUT_NOT_REJECTED",
        "The seat layout was accepted and cannot be changed in this correction round.",
        409
      );
    }
    const assignment = policy.requireRecord(
      await repository.findAssignment(fleetId),
      "FLEET_LAYOUT_ASSIGNMENT_NOT_FOUND", "Fleet seat-layout assignment not found."
    );
    const revision = await loadPublishedRevision(proposedRevisionId);
    await assertTemplateAccess(fleet, revision);
    if (sameId(assignment.activeRevisionId, proposedRevisionId)) {
      throw new SeatLayoutPersistenceError(
        "FLEET_LAYOUT_ALREADY_ACTIVE", "This seat-layout revision is already active for the fleet."
      );
    }
    return repository.createChangeRequest({ fleet, assignment, revision, actor });
  }

  async function correctRejectedLayout(fleetId, proposedRevisionId, actor) {
    const fleet = await assertFleetAccess(fleetId, actor);
    if (
      fleet.approvalStatus !== "REJECTED"
      || (!isLegacyOverallRejection(fleet) && fleet.sectionReviews?.seatLayout?.status !== "rejected")
    ) {
      throw new SeatLayoutPersistenceError("FLEET_LAYOUT_NOT_REJECTED", "The seat layout is not open for correction.", 409);
    }
    const assignment = policy.requireRecord(await repository.findAssignment(fleetId), "FLEET_LAYOUT_ASSIGNMENT_NOT_FOUND", "Fleet seat-layout assignment not found.");
    const revision = await loadPublishedRevision(proposedRevisionId);
    const template = await assertTemplateAccess(fleet, revision);
    if (sameId(assignment.activeRevisionId, proposedRevisionId)) {
      throw new SeatLayoutPersistenceError("FLEET_LAYOUT_CORRECTION_UNCHANGED", "Choose a corrected seat layout before resubmitting.", 409);
    }
    return repository.replaceRejectedAssignment({ fleet, assignment, revision, template, actor });
  }

  async function approveChange(requestId, actor) {
    policy.assertActor(actor);
    if (actor.type !== "SUPER_ADMIN") {
      throw new SeatLayoutPersistenceError(
        "FLEET_LAYOUT_REVIEW_FORBIDDEN", "Only a super admin can approve a fleet layout change.", 403
      );
    }
    return repository.approveChangeRequest(requestId, actor);
  }

  async function rejectChange(requestId, note, actor) {
    policy.assertActor(actor);
    if (actor.type !== "SUPER_ADMIN") {
      throw new SeatLayoutPersistenceError(
        "FLEET_LAYOUT_REVIEW_FORBIDDEN", "Only a super admin can reject a fleet layout change.", 403
      );
    }
    return repository.rejectChangeRequest(requestId, note, actor);
  }

  return { assignInitial, createInitialCustomLayout, requestChange, correctRejectedLayout, approveChange, rejectChange };
}

module.exports = { createFleetSeatLayoutService };
