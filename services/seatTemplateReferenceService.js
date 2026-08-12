"use strict";

const Schedule = require("../models/scheduleModel");
const Trip = require("../models/tripModel");
const Fleet = require("../models/fleetModel");
const SeatTemplate = require("../models/seatTemplateModel");
const SeatLayoutVersion = require("../models/seatLayoutVersionModel");
const { SeatTemplateError } = require("../src/domain/seat-layout/seat-template.error");

function createReferenceService({
  ScheduleModel = Schedule,
  TripModel = Trip,
  FleetModel = Fleet,
  TemplateModel = SeatTemplate,
  VersionModel = SeatLayoutVersion,
} = {}) {
  async function countReferences(templateId) {
    const versionIds = await VersionModel.find({ templateId }).distinct("_id");
    const [legacyScheduleCount, legacyTripCount, fleetCount, scheduleCount, tripCount] = await Promise.all([
      ScheduleModel.countDocuments({ seatTemplateId: templateId }),
      TripModel.countDocuments({ seatTemplateId: templateId }),
      FleetModel.countDocuments({ seatLayoutVersionId: { $in: versionIds } }),
      ScheduleModel.countDocuments({ seatLayoutVersionId: { $in: versionIds } }),
      TripModel.countDocuments({ seatLayoutVersionId: { $in: versionIds } }),
    ]);
    const total = legacyScheduleCount + legacyTripCount + fleetCount + scheduleCount + tripCount;
    return {
      legacyScheduleCount, legacyTripCount, fleetCount, scheduleCount, tripCount, total,
    };
  }

  async function assertUnreferenced(templateId, operation) {
    const counts = await countReferences(templateId);
    if (counts.total > 0) {
      throw new SeatTemplateError(
        "SEAT_TEMPLATE_IN_USE",
        `Seat template cannot be ${operation} because schedules or trips reference it. Deactivate it instead.`,
        409,
        counts
      );
    }
    return counts;
  }

  async function assertDeletable(templateId) {
    const counts = await countReferences(templateId);
    const [versionCount, derivedTemplateCount] = await Promise.all([
      VersionModel.countDocuments({ templateId }),
      TemplateModel.countDocuments({ baseTemplateId: templateId }),
    ]);
    if (counts.total > 0 || versionCount > 0 || derivedTemplateCount > 0) {
      throw new SeatTemplateError(
        "SEAT_TEMPLATE_IN_USE",
        "Versioned or derived seat templates cannot be deleted. Deactivate them instead.",
        409,
        { ...counts, versionCount, derivedTemplateCount }
      );
    }
  }

  return { countReferences, assertUnreferenced, assertDeletable };
}

module.exports = { createReferenceService };
