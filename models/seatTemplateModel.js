const mongoose = require("mongoose");

const seatTemplateUnitSchema = new mongoose.Schema({
    seatNo: { type: String, required: true },
}, { _id: false });

const seatTemplateSchema = new mongoose.Schema({
    templateName: {
        type: String,
        required: true
    },

    totalSeats: {
        type: Number,
        required: true
    },

    seata: [seatTemplateUnitSchema],
    seatb: [seatTemplateUnitSchema],
    seatc: [seatTemplateUnitSchema],

    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
    },
    createdById: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SuperAdmin",
    },


    isActive: {
        type: Boolean,
        default: true
    }

}, { timestamps: true });

module.exports = mongoose.model("SeatTemplate", seatTemplateSchema);
