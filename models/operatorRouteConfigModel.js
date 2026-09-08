const mongoose = require("mongoose");

const operatorRouteConfigSchema = new mongoose.Schema(
    {
        brandId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "OperatorBrand",
            required: true,
        },
        variantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "RouteVariant",
            required: true,
        },
        fleetId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Buse",
            default: null,
            index: true,
        },
        patternName: {
            type: String,
            required: true,
            default: "Standard",
            trim: true,
            maxlength: [40, "Pattern name cannot exceed 40 characters."],
        },
        isDefault: {
            type: Boolean,
            default: false,
        },
        activeStops: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Stop",
            },
        ],
        boardingConfig: [
            {
                stopId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "Stop",
                },
                boardingPointIds: [
                    {
                        type: mongoose.Schema.Types.ObjectId,
                        ref: "BoardingPoints",
                    },
                ],
            },
        ],
        timingConfig: [
            {
                stopId:             { type: mongoose.Schema.Types.ObjectId, ref: "Stop" },
                estimatedArrival:   { type: String, default: "" },
                estimatedDeparture: { type: String, default: "" },
                haltDuration:       { type: Number, default: 5, min: 0 },
                dayOffset:          { type: Number, default: 0 },
                stopBehavior:       { type: String, enum: ["BOARDING_ONLY", "DROPPING_ONLY", "BOTH", "REST_STOP"], default: "BOTH" },
            },
        ],

        returnActiveStops: [
            { type: mongoose.Schema.Types.ObjectId, ref: "Stop" },
        ],
        returnBoardingConfig: [
            {
                stopId: { type: mongoose.Schema.Types.ObjectId, ref: "Stop" },
                boardingPointIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "BoardingPoints" }],
            },
        ],
        returnTimingConfig: [
            {
                stopId:             { type: mongoose.Schema.Types.ObjectId, ref: "Stop" },
                estimatedArrival:   { type: String, default: "" },
                estimatedDeparture: { type: String, default: "" },
                haltDuration:       { type: Number, default: 5, min: 0 },
                dayOffset:          { type: Number, default: 0 },
                stopBehavior:       { type: String, enum: ["BOARDING_ONLY", "DROPPING_ONLY", "BOTH", "REST_STOP"], default: "BOTH" },
            },
        ],
        returnOverridden: {
            type: Boolean,
            default: false,
        },
        minimumJourneyMinutes: {
            type: Number,
            default: 60,
            min: 0,
        },
        status: {
            type: String,
            enum: ["ACTIVE", "INACTIVE", "PENDING_REVIEW", "DRAFT"],
            default: "ACTIVE",
        },
        notes: {
            type: String,
        },
    },
    { timestamps: true }
);

operatorRouteConfigSchema.index(
    { brandId: 1, variantId: 1, fleetId: 1, patternName: 1 },
    { unique: true, name: "brandId_1_variantId_1_fleetId_1_patternName_1" }
);
operatorRouteConfigSchema.index({ variantId: 1, status: 1 });
operatorRouteConfigSchema.index({ brandId: 1, status: 1 });

module.exports = mongoose.model("OperatorRouteConfig", operatorRouteConfigSchema);
