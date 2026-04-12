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
    distance: {
      type: String, // e.g., "350 km"
    },
    duration: {
      type: String, // e.g., "8 hours"
    },
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
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // The Bus Owner who created/owns this route
      required: true,
    },
  },
  { timestamps: true }
);

// Index for faster searching
routeSchema.index({ from: 1, to: 1 });

module.exports = mongoose.models.BusRoute || mongoose.model("BusRoute", routeSchema);
