const mongoose = require("mongoose");

const routeSchema = new mongoose.Schema(
  {
    routeName: {
      type: String,
      required: true,
      trim: true,
    },
    via: {
      type: String, // e.g. "BP Highway" or "Hetauda"
      trim: true,
    },
    from: {
      type: String,
      required: true,
      trim: true,
    },
    to: {
      type: String,
      required: true,
      trim: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false, // Optional for GLOBAL routes
    },
    returnRouteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusRoute", // Links to the reciprocal trip
    },
    type: {
      type: String,
      enum: ["GLOBAL", "CUSTOM"],
      default: "GLOBAL",
    },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
    },
    distanceKm: {
      type: Number,
    },
    durationMinutes: {
      type: Number,
    },
    stoppages: [{
      name: { type: String, required: true },
      city: { type: String },
      distanceFromSource: { type: Number, default: 0 },
      linkedPoints: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "BoardingPoints",
      }],
      isIntermediate: { type: Boolean, default: false },
    }],
  },
  { timestamps: true }
);

module.exports = mongoose.model("BusRoute", routeSchema);
