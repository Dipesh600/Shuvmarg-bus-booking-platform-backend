"use strict";

const crypto = require("node:crypto");
const SeatLayoutVersion = require("../models/seatLayoutVersionModel");
const SeatTemplate = require("../models/seatTemplateModel");
const {
  validateSeatLayout,
  seatLayoutFingerprint,
} = require("../src/domain/seat-layout/seat-layout.validation");
const { SeatTemplateError, notFound } = require("../src/domain/seat-layout/seat-template.error");

function createVersionService({ Version = SeatLayoutVersion, Template = SeatTemplate } = {}) {
  async function createVersion(templateId, seatConfig, actor = {}) {
    const template = await Template.findById(templateId);
    if (!template) throw notFound();
    const layout = validateSeatLayout(seatConfig);
    const fingerprint = crypto.createHash("sha256")
      .update(seatLayoutFingerprint(layout.seatConfig)).digest("hex");
    if (actor.reuseExisting) {
      const existing = await Version.findOne({ templateId, fingerprint });
      if (existing) return existing;
    }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const latest = await Version.findOne({ templateId })
        .sort({ versionNumber: -1 }).select("versionNumber").lean();
      try {
        const version = await Version.create({
          templateId,
          versionNumber: (latest?.versionNumber || 0) + 1,
          sourceVersionId: actor.sourceVersionId || null,
          seatConfig: layout.seatConfig,
          totalSeats: layout.totalSeats,
          createdById: actor.createdById || null,
          changeNote: actor.changeNote || null,
        });
        if (actor.publishTemplate !== false) try {
          await Template.findByIdAndUpdate(templateId, {
            currentVersionId: version._id,
            seatConfig: layout.seatConfig,
            totalSeats: layout.totalSeats,
          });
        } catch (error) {
          // Internal compensation only: published versions remain immutable to callers.
          await Version.collection.deleteOne({ _id: version._id }).catch(() => {});
          throw error;
        }
        return version;
      } catch (error) {
        if (error?.code !== 11000 || attempt === 2) {
          if (error?.code === 11000) {
            throw new SeatTemplateError(
              "SEAT_LAYOUT_VERSION_CONFLICT",
              "This exact layout version already exists.",
              409
            );
          }
          throw error;
        }
      }
    }
    throw new SeatTemplateError("SEAT_LAYOUT_VERSION_CONFLICT", "Could not allocate layout version.", 409);
  }

  async function getVersion(id) {
    const version = await Version.findById(id).lean();
    if (!version) {
      throw new SeatTemplateError("SEAT_LAYOUT_VERSION_NOT_FOUND", "Seat layout version not found.", 404);
    }
    return version;
  }

  return { createVersion, getVersion };
}

module.exports = { ...createVersionService(), createVersionService };
