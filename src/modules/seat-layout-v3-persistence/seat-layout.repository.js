"use strict";

const SeatLayoutTemplate = require("../../../models/seatLayoutTemplateModel");
const SeatLayoutRevision = require("../../../models/seatLayoutRevisionModel");
const { SeatLayoutPersistenceError } = require("./seat-layout-persistence.error");

async function createTemplate(data) {
  return SeatLayoutTemplate.create(data);
}

async function findTemplate(id) {
  return SeatLayoutTemplate.findById(id);
}

async function findRevision(id) {
  return SeatLayoutRevision.findById(id);
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

async function submitRevision({ templateId, revisionId }) {
  const revision = await SeatLayoutRevision.findOneAndUpdate(
    { _id: revisionId, templateId, status: "DRAFT" }, { $set: { status: "IN_REVIEW" } },
    { new: true, runValidators: true }
  );
  if (!revision) {
    throw new SeatLayoutPersistenceError(
      "SEAT_LAYOUT_REVISION_SUBMIT_CONFLICT", "The revision changed before it could be submitted."
    );
  }
  return revision;
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
      result = published;
    });
    return result;
  } finally {
    await session.endSession();
  }
}

module.exports = {
  createTemplate, findTemplate, findRevision, allocateRevisionNumber,
  createRevision, submitRevision, adoptPlatformTemplate, publishRevision,
};
