"use strict";

const mongoose = require("mongoose");
const {
  REVISION_STATUSES, ACTOR_TYPES,
} = require("../src/modules/seat-layout-v3-persistence/seat-layout-persistence.constants");
const {
  validateSeatLayoutV3, seatLayoutV3Fingerprint,
} = require("../src/domain/seat-layout-v3");
const { preventDeletes, lifecycleError } = require("./schemas/append-only.guard");

const seatLayoutRevisionSchema = new mongoose.Schema({
  templateId: {
    type: mongoose.Schema.Types.ObjectId, ref: "SeatLayoutTemplate", required: true, immutable: true,
  },
  revisionNumber: { type: Number, required: true, min: 1, immutable: true },
  baseRevisionId: {
    type: mongoose.Schema.Types.ObjectId, ref: "SeatLayoutRevision", default: null, immutable: true,
  },
  sourceRevisionId: {
    type: mongoose.Schema.Types.ObjectId, ref: "SeatLayoutRevision", default: null, immutable: true,
  },
  status: { type: String, enum: REVISION_STATUSES, default: "DRAFT", index: true },
  layout: { type: mongoose.Schema.Types.Mixed, required: true, immutable: true },
  physicalFingerprint: { type: String, required: true, immutable: true },
  totalPlaces: { type: Number, required: true, min: 1, immutable: true },
  changeSummary: { type: String, trim: true, maxlength: 500, default: null, immutable: true },
  createdByType: { type: String, enum: ACTOR_TYPES, required: true, immutable: true },
  createdById: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  publishedAt: { type: Date, default: null },
  publishedById: { type: mongoose.Schema.Types.ObjectId, default: null },
}, { timestamps: true, strict: "throw" });

seatLayoutRevisionSchema.pre("validate", function validatePhysicalLayout(next) {
  try {
    const result = validateSeatLayoutV3(this.layout);
    this.layout = result.layout;
    this.totalPlaces = result.totalPlaces;
    this.physicalFingerprint = seatLayoutV3Fingerprint(result.layout);
    return next();
  } catch (error) {
    return next(error);
  }
});

seatLayoutRevisionSchema.index({ templateId: 1, revisionNumber: 1 }, { unique: true });
seatLayoutRevisionSchema.index({ templateId: 1, status: 1, createdAt: -1 });
seatLayoutRevisionSchema.index({ templateId: 1, physicalFingerprint: 1 });
preventDeletes(seatLayoutRevisionSchema, "Seat-layout revision");

const ALLOWED_UPDATE_PATHS = new Set(["status", "publishedAt", "publishedById", "updatedAt"]);
seatLayoutRevisionSchema.pre(["updateOne", "updateMany", "findOneAndUpdate"], function guardRevisionUpdate() {
  const update = this.getUpdate() || {};
  const paths = Object.entries(update).flatMap(([operator, value]) => (
    operator.startsWith("$") ? Object.keys(value || {}) : [operator]
  ));
  if (paths.some((path) => !ALLOWED_UPDATE_PATHS.has(path))) {
    throw lifecycleError("Seat-layout revision physical data", "updated");
  }
});
seatLayoutRevisionSchema.pre("replaceOne", function rejectReplacement() {
  throw lifecycleError("Seat-layout revision", "replaced");
});

module.exports = mongoose.model("SeatLayoutRevision", seatLayoutRevisionSchema);
