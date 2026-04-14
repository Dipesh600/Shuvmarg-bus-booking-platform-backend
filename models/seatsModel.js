const mongoose = require("mongoose");

const seatUnitSchema = new mongoose.Schema({
    seatNo:     { type: String, required: true },
    booked:     { type: Boolean, default: false },
    bookedBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    bookedAt:   { type: Date, default: null },
    seatClass:  {
        type: String,
        enum: ["window", "aisle", "upper", "lower", "sleeper"],
        default: "window",
    },
    blockedFor: {
        type: String,
        enum: ["none", "wheelchair", "reserved"],
        default: "none",
    },
}, { _id: false });

const seatSchema = new mongoose.Schema({
    tripId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Trip",
        required: true,
        unique: true,   // 1 seat document per trip
        index: true,    // Critical for O(1) lookup
    },
    seata: [seatUnitSchema],
    seatb: [seatUnitSchema],
    seatc: [seatUnitSchema],
}, { timestamps: true });

module.exports = mongoose.model("Seat", seatSchema);
