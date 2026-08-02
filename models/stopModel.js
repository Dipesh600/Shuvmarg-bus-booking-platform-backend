const mongoose = require("mongoose");
const { buildStopIdentity } = require("../src/modules/admin/platform-registry/stop-identity");
const { validateCoordinates } = require("../src/domain/stop/stop-coordinate-validation");
const { validateParentHierarchy } = require("../src/domain/stop/stop-parent-validation");
const { buildCodeCandidates } = require("../src/domain/stop/stop-code-candidates");
const { normalizeAliases } = require("../src/domain/stop/stop-alias-normalization");
const { MAP_COORDINATE_SOURCES } = require("../src/domain/stop/stop-map-selection");

const stopSchema = new mongoose.Schema(
  {
    code: { type: String, unique: true, sparse: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    _normalizedIdentity: { type: String },
    aliases: [{ type: String, trim: true }],
    type: {
      type: String,
      enum: ["CITY", "JUNCTION", "TOWN", "HIGHWAY_STOP", "BORDER"],
      default: "CITY",
    },
    parentStopId: { type: mongoose.Schema.Types.ObjectId, ref: "Stop", default: null },
    isSearchable: { type: Boolean, required: true, default: true },
    isRouteStop: { type: Boolean, required: true, default: true },
    province: { type: String, trim: true },
    district: { type: String, trim: true },
    municipality: { type: String, trim: true },
    coordinates: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },
    coordinateSource: { type: String, enum: MAP_COORDINATE_SOURCES, default: null },
    coordinateAccuracyMeters: { type: Number, min: 0, default: null },
    coordinateCapturedAt: { type: Date, default: null },
    coordinateProvider: { type: String, enum: ["GOOGLE", "MAPBOX"], default: null },
    coordinatePlaceId: { type: String, trim: true, maxlength: 250, default: null },
    coordinateSuggestedAddress: { type: String, trim: true, maxlength: 500, default: null },
    verificationStatus: {
      type: String,
      enum: ["PENDING", "VERIFIED", "REJECTED"],
      default: "VERIFIED",
    },
    source: {
      type: String,
      enum: ["MANUAL", "DISCOVERY"],
      default: "MANUAL",
    },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
    selectionCount: { type: Number, default: 0, index: true },
    recentSelectionCount: { type: Number, default: 0 },
    popularityScore: { type: Number, default: 0, index: true },
  },
  { timestamps: true }
);

// Indexes
stopSchema.index({ name: "text", code: "text", aliases: "text" });
stopSchema.index({ status: 1 });
stopSchema.index({ status: 1, popularityScore: -1 });
stopSchema.index({ source: 1, verificationStatus: 1 });
stopSchema.index({ _normalizedIdentity: 1 }, { unique: true });
stopSchema.index({ parentStopId: 1, status: 1 });

// Hierarchy & Coordinate Validation
stopSchema.pre("validate", async function (next) {
  const coordErr = validateCoordinates(this.coordinates);
  if (coordErr) return next(coordErr);

  const parentErr = await validateParentHierarchy(this, this.parentStopId, this.constructor);
  if (parentErr) return next(parentErr);

  next();
});

// Deduplication & Alias Normalization Hook
stopSchema.pre("save", function (next) {
  try {
    this._normalizedIdentity = buildStopIdentity({
      name: this.name,
      district: this.district,
      municipality: this.municipality,
      parentStopId: this.parentStopId,
    });
  } catch (err) {
    return next(err);
  }

  if (this.isModified("aliases") && Array.isArray(this.aliases)) {
    this.aliases = normalizeAliases(this.aliases, this.name);
  }

  next();
});

// Static: createWithUniqueCode
stopSchema.statics.createWithUniqueCode = async function (stopData) {
  if (stopData.code) {
    return await this.create({ ...stopData });
  }

  const candidates = buildCodeCandidates(stopData.name, stopData.district);

  for (const candidate of candidates) {
    try {
      return await this.create({ ...stopData, code: candidate });
    } catch (err) {
      const isDupCode =
        err.code === 11000 &&
        err.keyPattern &&
        (err.keyPattern.code === 1 || err.keyPattern["code"] !== undefined);

      if (isDupCode) continue;

      const isDupIdentity =
        err.code === 11000 &&
        err.keyPattern &&
        (err.keyPattern._normalizedIdentity === 1 ||
          err.keyPattern["_normalizedIdentity"] !== undefined);

      if (isDupIdentity) {
        const customErr = new Error("A stop with this identity already exists.");
        customErr.code = "STOP_IDENTITY_CONFLICT";
        customErr.statusCode = 409;
        throw customErr;
      }

      throw err;
    }
  }

  throw new Error(`[StopRegistry] Could not generate a unique code for stop: "${stopData.name}"`);
};

module.exports = mongoose.model("Stop", stopSchema);
