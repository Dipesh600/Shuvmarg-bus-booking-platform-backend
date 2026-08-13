"use strict";

const { SeatLayoutPersistenceError } = require("./seat-layout-persistence.error");

function requireRecord(record, code, message) {
  if (!record) throw new SeatLayoutPersistenceError(code, message, 404);
  return record;
}

function assertActor(actor) {
  if (!actor?.id || !["SUPER_ADMIN", "BUS_OWNER", "SYSTEM"].includes(actor.type)) {
    throw new SeatLayoutPersistenceError("SEAT_LAYOUT_ACTOR_INVALID", "A valid layout actor is required.", 403);
  }
}

function assertCanCreateTemplate(scope, ownerId, actor) {
  assertActor(actor);
  if (scope === "PLATFORM" && actor.type !== "SUPER_ADMIN") {
    throw new SeatLayoutPersistenceError(
      "PLATFORM_TEMPLATE_FORBIDDEN", "Only a super admin can create a platform layout template.", 403
    );
  }
  if (scope === "OPERATOR" && (!ownerId || (actor.type === "BUS_OWNER" && String(ownerId) !== String(actor.id)))) {
    throw new SeatLayoutPersistenceError(
      "OPERATOR_TEMPLATE_FORBIDDEN", "An operator template must belong to the acting bus owner.", 403
    );
  }
}

function assertCanPublish(revision, actor) {
  assertActor(actor);
  if (actor.type !== "SUPER_ADMIN") {
    throw new SeatLayoutPersistenceError(
      "SEAT_LAYOUT_PUBLISH_FORBIDDEN", "Only a super admin can publish a layout revision.", 403
    );
  }
  if (!["DRAFT", "IN_REVIEW"].includes(revision.status)) {
    throw new SeatLayoutPersistenceError(
      "SEAT_LAYOUT_REVISION_NOT_PUBLISHABLE", "Only a draft or reviewed revision can be published."
    );
  }
}

function assertCanModifyTemplate(template, actor) {
  assertActor(actor);
  if (actor.type === "SUPER_ADMIN") return;
  if (template.scope !== "OPERATOR" || String(template.ownerId) !== String(actor.id)) {
    throw new SeatLayoutPersistenceError(
      "SEAT_LAYOUT_TEMPLATE_MODIFY_FORBIDDEN", "This template cannot be modified by the acting owner.", 403
    );
  }
}

function assertRevisionBelongsToTemplate(template, revision) {
  if (String(revision.templateId) !== String(template._id || template.id)) {
    throw new SeatLayoutPersistenceError(
      "SEAT_LAYOUT_REVISION_TEMPLATE_MISMATCH", "The revision does not belong to this template."
    );
  }
}

module.exports = {
  requireRecord, assertActor, assertCanCreateTemplate, assertCanPublish, assertCanModifyTemplate,
  assertRevisionBelongsToTemplate,
};
