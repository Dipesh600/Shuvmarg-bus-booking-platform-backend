"use strict";

const crypto = require("node:crypto");
const Bus = require("../models/fleetModel");
const SeatTemplate = require("../models/seatTemplateModel");
const SeatLayoutVersion = require("../models/seatLayoutVersionModel");
const {
  validateSeatLayout,
  seatLayoutFingerprint,
} = require("../src/domain/seat-layout/seat-layout.validation");
const { SeatTemplateError } = require("../src/domain/seat-layout/seat-template.error");

const hash = (config) => crypto.createHash("sha256")
  .update(seatLayoutFingerprint(config)).digest("hex");

function snapshot(version, layoutVersionId = null) {
  const layout = validateSeatLayout(version.seatConfig);
  return {
    seatLayoutVersionId: layoutVersionId,
    seatLayoutSnapshot: {
      versionNumber: version.versionNumber || null,
      fingerprint: version.fingerprint || hash(layout.seatConfig),
      totalSeats: layout.totalSeats,
      seatConfig: layout.seatConfig,
      capturedAt: new Date(),
    },
  };
}

function createSnapshotService({
  BusModel = Bus,
  TemplateModel = SeatTemplate,
  VersionModel = SeatLayoutVersion,
} = {}) {
  async function byVersion(versionId) {
    if (!versionId) return null;
    const version = await VersionModel.findById(versionId).lean();
    if (!version) {
      throw new SeatTemplateError(
        "SEAT_LAYOUT_VERSION_NOT_FOUND",
        "The assigned seat layout version no longer exists.",
        409
      );
    }
    return snapshot(version, version._id);
  }

  async function resolveForSchedule(schedule, serviceDate = new Date()) {
    const usesNext = schedule.nextSeatLayoutVersionId && schedule.seatLayoutEffectiveAt &&
      new Date(serviceDate) >= new Date(schedule.seatLayoutEffectiveAt);
    const scheduled = await byVersion(
      usesNext ? schedule.nextSeatLayoutVersionId : schedule.seatLayoutVersionId
    );
    if (scheduled) return scheduled;
    if (schedule.seatTemplateId) {
      const template = await TemplateModel.findOne({
        _id: schedule.seatTemplateId,
        isActive: true,
      })
        .select("currentVersionId seatConfig").lean();
      if (!template) {
        throw new SeatTemplateError("SEAT_TEMPLATE_NOT_FOUND", "Seat template not found.", 409);
      }
      const templateVersion = await byVersion(template.currentVersionId);
      if (templateVersion) return templateVersion;
      if (template.seatConfig?.floors?.length) return snapshot(template);
    }
    const bus = await BusModel.findById(schedule.busId)
      .select("seatLayoutVersionId nextSeatLayoutVersionId seatLayoutEffectiveAt seatConfig").lean();
    if (!bus) throw new SeatTemplateError("FLEET_NOT_FOUND", "Fleet not found.", 404);
    const fleetUsesNext = bus.nextSeatLayoutVersionId && bus.seatLayoutEffectiveAt &&
      new Date(serviceDate) >= new Date(bus.seatLayoutEffectiveAt);
    const fleetVersion = await byVersion(
      fleetUsesNext ? bus.nextSeatLayoutVersionId : bus.seatLayoutVersionId
    );
    if (fleetVersion) return fleetVersion;
    if (bus.seatConfig?.floors?.length) return snapshot(bus);
    throw new SeatTemplateError(
      "SEAT_LAYOUT_REQUIRED",
      "Fleet has no usable seat layout. Assign a versioned layout before generating trips.",
      409
    );
  }

  return { resolveForSchedule };
}

module.exports = { ...createSnapshotService(), createSnapshotService, snapshot };
