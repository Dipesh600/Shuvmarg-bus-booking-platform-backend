"use strict";

const SeatLayoutTemplate = require("../../../models/seatLayoutTemplateModel");
const SeatLayoutRevision = require("../../../models/seatLayoutRevisionModel");
const SeatLayoutAuditEvent = require("../../../models/seatLayoutAuditEventModel");
const { SeatLayoutPersistenceError } = require("./seat-layout-persistence.error");

async function createTemplate(data) {
  const session = await SeatLayoutTemplate.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      [result] = await SeatLayoutTemplate.create([data], { session });
      await SeatLayoutAuditEvent.create([{
        action: "TEMPLATE_CREATED", actorType: data.createdByType, actorId: data.createdById,
        templateId: result._id, metadata: { scope: result.scope, templateCode: result.templateCode },
      }], { session });
    });
    return result;
  } finally { await session.endSession(); }
}

async function findTemplate(id) {
  return SeatLayoutTemplate.findById(id);
}

async function findRevision(id) {
  return SeatLayoutRevision.findById(id);
}

async function findOwnedAdoption(sourceTemplateId, ownerId) {
  return SeatLayoutTemplate.findOne({ sourceTemplateId, ownerId, scope: "OPERATOR", status: "ACTIVE" });
}

async function allocateRevisionNumber(templateId) {
  const template = await SeatLayoutTemplate.findOneAndUpdate(
    { _id: templateId, status: "ACTIVE" }, { $inc: { revisionCounter: 1 } },
    { new: true, projection: { revisionCounter: 1 } }
  );
  if (!template) {
    throw new SeatLayoutPersistenceError(
      "SEAT_LAYOUT_TEMPLATE_NOT_REVISIONABLE", "The template is missing or archived."
    );
  }
  return template.revisionCounter;
}

async function createRevision(data) {
  return SeatLayoutRevision.create(data);
}

async function createRevisionAtomic(data, actor) {
  const session = await SeatLayoutTemplate.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const template = await SeatLayoutTemplate.findOneAndUpdate(
        { _id: data.templateId, status: "ACTIVE" }, { $inc: { revisionCounter: 1 } },
        { new: true, projection: { revisionCounter: 1 }, session }
      );
      if (!template) throw new SeatLayoutPersistenceError("SEAT_LAYOUT_TEMPLATE_NOT_REVISIONABLE", "The template is missing or archived.");
      [result] = await SeatLayoutRevision.create([{ ...data, revisionNumber: template.revisionCounter }], { session });
      await SeatLayoutAuditEvent.create([{
        action: "REVISION_CREATED", actorType: actor.type, actorId: actor.id,
        templateId: data.templateId, revisionId: result._id,
        metadata: { revisionNumber: result.revisionNumber, totalPlaces: result.totalPlaces },
      }], { session });
    });
    return result;
  } finally { await session.endSession(); }
}

async function submitRevision({ templateId, revisionId, actor }) {
  const session = await SeatLayoutTemplate.startSession();
  let revision;
  try {
    await session.withTransaction(async () => {
      revision = await SeatLayoutRevision.findOneAndUpdate(
        { _id: revisionId, templateId, status: "DRAFT" }, { $set: { status: "IN_REVIEW" } },
        { new: true, runValidators: true, session }
      );
      if (!revision) throw new SeatLayoutPersistenceError("SEAT_LAYOUT_REVISION_SUBMIT_CONFLICT", "The revision changed before it could be submitted.");
      await SeatLayoutAuditEvent.create([{
        action: "REVISION_SUBMITTED", actorType: actor.type,
        actorId: actor.id, templateId, revisionId,
      }], { session });
    });
    return revision;
  } finally { await session.endSession(); }
}

async function adoptPlatformTemplate({
  sourceTemplate, sourceRevision, ownerId, templateCode, name, actor,
}) {
  const session = await SeatLayoutTemplate.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const [template] = await SeatLayoutTemplate.create([{
        templateCode, name, scope: "OPERATOR", ownerId,
        sourceTemplateId: sourceTemplate._id, vehicleCategory: sourceTemplate.vehicleCategory,
        revisionCounter: 1, createdByType: actor.type, createdById: actor.id,
      }], { session });
      const [revision] = await SeatLayoutRevision.create([{
        templateId: template._id, revisionNumber: 1, sourceRevisionId: sourceRevision._id,
        status: "PUBLISHED", layout: sourceRevision.layout,
        physicalFingerprint: sourceRevision.physicalFingerprint,
        totalPlaces: sourceRevision.totalPlaces, changeSummary: "Adopted from platform template",
        createdByType: actor.type, createdById: actor.id,
        publishedAt: new Date(), publishedById: sourceRevision.publishedById || actor.id,
      }], { session });
      template.currentPublishedRevisionId = revision._id;
      await template.save({ session });
      await SeatLayoutAuditEvent.create([{
        action: "TEMPLATE_ADOPTED", actorType: actor.type, actorId: actor.id,
        templateId: template._id, revisionId: revision._id,
        metadata: { sourceTemplateId: sourceTemplate._id },
      }], { session });
      result = { template, revision };
    });
    return result;
  } finally {
    await session.endSession();
  }
}

async function publishRevision({ template, revision, actor }) {
  const session = await SeatLayoutTemplate.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const published = await SeatLayoutRevision.findOneAndUpdate(
        { _id: revision._id, templateId: template._id, status: { $in: ["DRAFT", "IN_REVIEW"] } },
        { $set: { status: "PUBLISHED", publishedAt: new Date(), publishedById: actor.id } },
        { new: true, runValidators: true, session }
      );
      if (!published) {
        throw new SeatLayoutPersistenceError(
          "SEAT_LAYOUT_REVISION_PUBLISH_CONFLICT", "The revision changed before it could be published."
        );
      }
      await SeatLayoutRevision.updateMany(
        { templateId: template._id, _id: { $ne: published._id }, status: "PUBLISHED" },
        { $set: { status: "RETIRED" } }, { session }
      );
      await SeatLayoutTemplate.updateOne(
        { _id: template._id }, { $set: { currentPublishedRevisionId: published._id } }, { session }
      );
      await SeatLayoutAuditEvent.create([{
        action: "REVISION_PUBLISHED", actorType: actor.type, actorId: actor.id,
        templateId: template._id, revisionId: published._id,
        metadata: { revisionNumber: published.revisionNumber },
      }], { session });
      result = published;
    });
    return result;
  } finally {
    await session.endSession();
  }
}

module.exports = {
  createTemplate, findTemplate, findRevision, findOwnedAdoption, allocateRevisionNumber,
  createRevision, createRevisionAtomic, submitRevision, adoptPlatformTemplate, publishRevision,
};
