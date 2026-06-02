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
    tempBookingId: {
      type: String,
      required: true,
      unique: true,
    },
    status: {
      type: String,
      enum: ["held", "completed"],
      default: "held",
    },
    expiresAt: {
      type: Date,
      required: true,
      // TTL Index: MongoDB automatically deletes the document when the current time reaches expiresAt
      index: { expires: 0 }, 
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("SeatHold", seatHoldSchema);
