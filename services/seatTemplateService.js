"use strict";

const SeatTemplate = require("../models/seatTemplateModel");
const {
  validateSeatLayout,
  seatLayoutFingerprint,
} = require("../src/domain/seat-layout/seat-layout.validation");
const { SeatTemplateError, notFound } = require("../src/domain/seat-layout/seat-template.error");
const { createReferenceService } = require("./seatTemplateReferenceService");
const { createVersionService } = require("./seatLayoutVersionService");

function createSeatTemplateService({
  SeatTemplateModel = SeatTemplate,
  references = createReferenceService(),
  versions = createVersionService(),
} = {}) {
  async function createTemplate(data, createdById) {
    const templateName = String(data.templateName || "").trim();
    if (!templateName || !data.seatConfig) {
      throw new SeatTemplateError(
        "INVALID_SEAT_TEMPLATE", "Template name and seat configuration are required.", 422
      );
    }
    const layout = validateSeatLayout(data.seatConfig);
    const template = await SeatTemplateModel.create({
      userId: data.userId,
      scope: data.scope || (data.userId ? "OPERATOR" : "GLOBAL"),
      baseTemplateId: data.baseTemplateId || null,
      templateName,
      totalSeats: layout.totalSeats,
      seatConfig: layout.seatConfig,
      createdById,
      isActive: data.isActive !== false,
    });
    try {
      await versions.createVersion(template._id, layout.seatConfig, { createdById });
      return SeatTemplateModel.findById(template._id);
    } catch (error) {
      await SeatTemplateModel.findByIdAndDelete(template._id).catch(() => {});
      throw error;
    }
  }

  const getAllTemplates = () => SeatTemplateModel.find().sort({ createdAt: -1 }).lean();
  const getTemplatesByUserId = (userId) => {
    if (!userId) throw new SeatTemplateError("INVALID_SEAT_TEMPLATE", "User ID is required.", 400);
    return SeatTemplateModel.find({ userId }).sort({ createdAt: -1 }).lean();
  };
  async function getTemplateById(id) {
    const template = await SeatTemplateModel.findById(id);
    if (!template) throw notFound();
    return template;
  }
  async function getActiveTemplateById(id) {
    const template = await SeatTemplateModel.findOne({ _id: id, isActive: true });
    if (!template) {
      throw new SeatTemplateError(
        "SEAT_TEMPLATE_NOT_ASSIGNABLE", "Seat template is missing or inactive.", 422
      );
    }
    return template;
  }

  async function updateTemplate(id, data) {
    const template = await getTemplateById(id);
    const update = {};
    if (data.templateName !== undefined) {
      update.templateName = String(data.templateName).trim();
      if (!update.templateName) {
        throw new SeatTemplateError("INVALID_SEAT_TEMPLATE", "Template name cannot be empty.", 422);
      }
    }
    if (data.seatConfig !== undefined) {
      const next = validateSeatLayout(data.seatConfig);
      if (seatLayoutFingerprint(template.seatConfig) !== seatLayoutFingerprint(next.seatConfig)) {
        await references.assertUnreferenced(id, "structurally changed");
        await versions.createVersion(id, next.seatConfig, {
          createdById: data.updatedById || null,
          sourceVersionId: template.currentVersionId || null,
          changeNote: data.changeNote || "Seat layout updated",
        });
      }
    }
    if (data.isActive !== undefined) update.isActive = Boolean(data.isActive);
    return SeatTemplateModel.findByIdAndUpdate(id, update, { new: true, runValidators: true });
  }

  async function deleteTemplate(id) {
    await getTemplateById(id);
    if (references.assertDeletable) await references.assertDeletable(id);
    else await references.assertUnreferenced(id, "deleted");
    return SeatTemplateModel.findByIdAndDelete(id);
  }
  async function toggleTemplateStatus(id) {
    const template = await getTemplateById(id);
    return SeatTemplateModel.findByIdAndUpdate(
      id, { isActive: template.isActive === false }, { new: true, runValidators: true }
    );
  }

  async function deriveTemplate(baseTemplateId, data, ownerId, createdById) {
    const base = await SeatTemplateModel.findOne({
      _id: baseTemplateId,
      scope: "GLOBAL",
      isActive: true,
    });
    if (!base) {
      throw new SeatTemplateError(
        "BASE_SEAT_TEMPLATE_NOT_ASSIGNABLE",
        "Global base template is missing or inactive.",
        422
      );
    }
    return createTemplate({
      ...data,
      userId: ownerId,
      scope: "OPERATOR",
      baseTemplateId,
      seatConfig: data.seatConfig || base.seatConfig,
    }, createdById);
  }

  return {
    createTemplate, getAllTemplates, getTemplatesByUserId, getTemplateById,
    getActiveTemplateById, updateTemplate, deleteTemplate, toggleTemplateStatus,
    deriveTemplate,
  };
}

module.exports = {
  ...createSeatTemplateService(),
  createSeatTemplateService,
};
