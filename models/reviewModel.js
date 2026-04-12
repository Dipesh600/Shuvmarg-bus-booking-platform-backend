const mongoose = require("mongoose");
const reviewSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      index: true,
    },
    fleetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Buse",
      required: true,
      index: true,
    },

    rating: {
      type: Number,
      required: true,
      min: [1, "Rating must be at least 1"],
      max: [5, "Rating cannot exceed 5"],
    },
    title: {
      type: String,
      default: null,
      trim: true,
      maxlength: 120,
    },
    comment: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2000,
    },
    images: {
      type: [String],
      default: [],
    },

    isAnonymous: {
      type: Boolean,
      default: false,
    },

    reported: {
      type: Boolean,
      default: false,
    },
    helpfulCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    meta: {
      type: Object,
      default: {},
    },
  },
  { timestamps: true }
);

// A user can leave at most one review for a specific booking
reviewSchema.index({ userId: 1, bookingId: 1, fleetId: 1 }, { unique: true });
// Common listing patterns
reviewSchema.index({ fleetId: 1, createdAt: -1 });

module.exports = mongoose.model("Review", reviewSchema);
