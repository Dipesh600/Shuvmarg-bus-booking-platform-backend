const mongoose = require("mongoose");

const seatHoldSchema = new mongoose.Schema(
  {
    tripId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Trip",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    seatNumbers: {
      type: [String],
      required: true,
    },
    seatKeys: {
      type: [String],
      select: false,
      default: undefined,
    },
    userTripKey: {
      type: String,
      select: false,
    },
    tempBookingId: {
      type: String,
      required: true,
      unique: true,
    },
    status: {
      type: String,
      enum: ["held", "processing", "completed", "released"],
      default: "held",
    },
    originalAmount: {
      type: Number,
      default: null,
      min: 0,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 },
    },
    completedAt: {
      type: Date,
      default: null,
    },
    processingAt: {
      type: Date,
      default: null,
    },
    heldExpiresAt: {
      type: Date,
      default: null,
    },
    releasedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

seatHoldSchema.index(
  { seatKeys: 1 },
  {
    unique: true,
    sparse: true,
    name: "uniq_active_trip_seat_hold",
  }
);

seatHoldSchema.index(
  { userTripKey: 1 },
  {
    unique: true,
    sparse: true,
    name: "uniq_active_user_trip_hold",
  }
);

module.exports = mongoose.model("SeatHold", seatHoldSchema);
