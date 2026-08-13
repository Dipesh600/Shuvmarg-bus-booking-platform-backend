"use strict";

const {
  validateSeatLayoutV3, seatLayoutV3Fingerprint,
} = require("../../domain/seat-layout-v3");
const policy = require("./seat-layout-persistence.policy");
const { SeatLayoutPersistenceError } = require("./seat-layout-persistence.error");

function createSeatLayoutTemplateService(repository) {
  async function createTemplate(input, actor) {
    policy.assertCanCreateTemplate(input.scope, input.ownerId, actor);
    return repository.createTemplate({
      templateCode: input.templateCode,
      name: input.name,
      scope: input.scope,
      ownerId: input.ownerId || null,
      // Adoption is the only workflow allowed to establish template lineage.
      sourceTemplateId: null,
      vehicleCategory: input.vehicleCategory,
      createdByType: actor.type,
      createdById: actor.id,
    });
  }

  async function createRevision(templateId, input, actor) {
    policy.assertActor(actor);
    const template = policy.requireRecord(
      await repository.findTemplate(templateId), "SEAT_LAYOUT_TEMPLATE_NOT_FOUND", "Seat-layout template not found."
    );
    if (template.status !== "ACTIVE") {
      throw new SeatLayoutPersistenceError("SEAT_LAYOUT_TEMPLATE_ARCHIVED", "Archived templates cannot be revised.");
    }
    policy.assertCanModifyTemplate(template, actor);
    const { layout, totalPlaces } = validateSeatLayoutV3(input.layout);
    const revisionNumber = await repository.allocateRevisionNumber(templateId);
    return repository.createRevision({
      templateId,
      revisionNumber,
      baseRevisionId: input.baseRevisionId || template.currentPublishedRevisionId || null,
      layout,
      totalPlaces,
      physicalFingerprint: seatLayoutV3Fingerprint(layout),
      changeSummary: input.changeSummary || null,
      createdByType: actor.type,
      createdById: actor.id,
    });
  }

  async function submitRevision(templateId, revisionId, actor) {
    const template = policy.requireRecord(
      await repository.findTemplate(templateId), "SEAT_LAYOUT_TEMPLATE_NOT_FOUND", "Seat-layout template not found."
    );
    policy.assertCanModifyTemplate(template, actor);
    const revision = policy.requireRecord(
      await repository.findRevision(revisionId), "SEAT_LAYOUT_REVISION_NOT_FOUND", "Seat-layout revision not found."
    );
    policy.assertRevisionBelongsToTemplate(template, revision);
    if (revision.status !== "DRAFT") {
      throw new SeatLayoutPersistenceError(
        "SEAT_LAYOUT_REVISION_NOT_SUBMITTABLE", "Only a draft revision can be submitted for review."
      );
    }
    return repository.submitRevision({ templateId, revisionId });
  }

  async function adoptPlatformTemplate(sourceTemplateId, input, actor) {
    policy.assertCanCreateTemplate("OPERATOR", input.ownerId, actor);
    const sourceTemplate = policy.requireRecord(
      await repository.findTemplate(sourceTemplateId),
      "SEAT_LAYOUT_TEMPLATE_NOT_FOUND", "Platform seat-layout template not found."
    );
    if (sourceTemplate.scope !== "PLATFORM" || sourceTemplate.status !== "ACTIVE"
      || !sourceTemplate.currentPublishedRevisionId) {
      throw new SeatLayoutPersistenceError(
        "SEAT_LAYOUT_SOURCE_NOT_REUSABLE", "Only an active published platform template can be reused."
      );
    }
    const sourceRevision = policy.requireRecord(
      await repository.findRevision(sourceTemplate.currentPublishedRevisionId),
      "SEAT_LAYOUT_REVISION_NOT_FOUND", "Published platform layout revision not found."
    );
    if (sourceRevision.status !== "PUBLISHED") {
      throw new SeatLayoutPersistenceError(
        "SEAT_LAYOUT_SOURCE_NOT_REUSABLE", "The platform template has no published revision."
      );
    }
    return repository.adoptPlatformTemplate({
      sourceTemplate, sourceRevision, ownerId: input.ownerId,
      templateCode: input.templateCode, name: input.name || sourceTemplate.name, actor,
    });
  }

  async function publishRevision(templateId, revisionId, actor) {
    const template = policy.requireRecord(
      await repository.findTemplate(templateId), "SEAT_LAYOUT_TEMPLATE_NOT_FOUND", "Seat-layout template not found."
    );
    const revision = policy.requireRecord(
      await repository.findRevision(revisionId), "SEAT_LAYOUT_REVISION_NOT_FOUND", "Seat-layout revision not found."
    );
    policy.assertRevisionBelongsToTemplate(template, revision);
    policy.assertCanPublish(revision, actor);
    return repository.publishRevision({ template, revision, actor });
  }

  return {
    createTemplate, adoptPlatformTemplate, createRevision, submitRevision, publishRevision,
  };
}

module.exports = { createSeatLayoutTemplateService };
