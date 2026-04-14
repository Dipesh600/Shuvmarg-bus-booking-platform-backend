const mongoose = require("mongoose");

const routeSchema = new mongoose.Schema(
  {
    routeName: {
      type: String,
      required: true,
      trim: true, // e.g., "Kathmandu - Biratnagar"
    },
    from: {
      type: String,
      required: true,
      trim: true, // e.g., "Kathmandu"
    },
    to: {
      type: String,
      required: true,
      trim: true, // e.g., "Biratnagar"
    },
    isRoundTrip: {
      type: Boolean,
      default: false,
    },
    distanceKm: {
      type: Number,
      default: null,  // e.g., 350
    },
    durationMinutes: {
      type: Number,
      default: null,  // e.g., 480
    },
    // Legacy display strings (deprecated, prefer distanceKm/durationMinutes)
    distance: { type: String, default: null }, // "350 km"
    duration: { type: String, default: null }, // "8 hours"
    basePrice: {
      type: Number,
      required: true,
      min: [0, "Base price cannot be negative"],
    },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
    },
    stoppages: [{
      name: { type: String, required: true },
      distanceFromSource: { type: Number, default: 0 },  // km
      isIntermediate: { type: Boolean, default: false },
      coordinates: {
        lat: { type: Number },
        lng: { type: Number },
      },
    }],
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // The Bus Owner who created/owns this route
      required: true,
    },
  },
  { timestamps: true }
);

// Index for faster searching
routeSchema.index({ from: 1, to: 1, status: 1 });
routeSchema.index({ ownerId: 1 });

module.exports = mongoose.models.BusRoute || mongoose.model("BusRoute", routeSchema);
