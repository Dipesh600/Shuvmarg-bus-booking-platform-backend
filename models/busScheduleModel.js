const mongoose = require("mongoose");

const busScheduleSchema = new mongoose.Schema(
  {
    busId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Buse",
      index: true,
    },
    // Google map route id
    routeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Route",
      index: true,
    },
    busRouteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusRoute",
      index: true,
      required: true,
    },
    seatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Seat",
      index: true,
      required: true,
    },
    departureTime: {
      type: String,
      required: true,
    },
    arrivalTime: {
      type: String,
      required: true, // "04:15 PM"
    },
    date: {
      type: String,
      required: true,
    },
    yatrapoints: {
      type: Number,
      default: 0, // e.g., 156.0
    },

    totalTimeTaken: {
      type: String,
      required: true,
    },
    shift: {
      type: String,
      enum: ["day", "night"],
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },

  },
  { timestamps: true }
);

// Prevent duplicate schedule creation for the same bus and date
busScheduleSchema.index({ bussNo: 1, date: 1 }, { unique: true });
// Common query patterns
busScheduleSchema.index({ date: 1, "route.from": 1, "route.to": 1 });
busScheduleSchema.index({ operatorId: 1, date: -1 });

module.exports = mongoose.model("busschedules", busScheduleSchema);
