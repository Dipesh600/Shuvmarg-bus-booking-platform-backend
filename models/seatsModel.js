const mongoose = require("mongoose");
const AutoSeat = require("./autoSeatsModel");

const seatUnitSchema = new mongoose.Schema({
    seatNo: { type: String, required: true },
    booked: { type: Boolean, default: false },
    bookedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    bookedAt: { type: Date, default: null }
}, { _id: false });

const seatSchema = new mongoose.Schema({
    tripId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Trip",
        required: true,
    },
    seata: [seatUnitSchema],
    seatb: [seatUnitSchema],
    seatc: [seatUnitSchema],
}, { timestamps: true });

module.exports = mongoose.model("Seat", seatSchema);
