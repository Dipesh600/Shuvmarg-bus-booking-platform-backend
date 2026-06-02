const mongoose = require("mongoose");

const routeRequestSchema = new mongoose.Schema(
    {
        ownerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        brandId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "OperatorBrand",
            default: null,
        },
        fleetId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Buse",
            default: null,
        },
        originCity: {
            type: String,
            required: true,
            trim: true,
        },
        destinationCity: {
            type: String,
            required: true,
            trim: true,
        },
        viaStops: {
            type: [String],
            default: [],
        },
        status: {
            type: String,
            enum: ["PENDING", "APPROVED", "REJECTED"],
            default: "PENDING",
        },
        adminNotes: {
            type: String,
            default: "",
        },
        rejectionReason: {
            type: String,
            default: null,
        },
        resolvedAt: {
            type: Date,
            default: null,
        },
        resolvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "SuperAdmin",
            default: null,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("RouteRequest", routeRequestSchema);

