const mongoose = require("mongoose");

const boardingPointsSchema = new mongoose.Schema(
    {
        // [NEW] Link to the Stop Registry (Layer 3)
        // This is the canonical reference to the city/node this point belongs to.
        // Optional for now (legacy records don't have this), but required for all new entries.
        stopId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Stop",
            default: null,
        },
        // Legacy city name field — kept for backward compatibility
        // New code should use stopId.name instead of this field
        city: {
            type: String,
            required: true,
            trim: true, // e.g., "Kathmandu"
        },
        pointName: {
            type: String,
            required: true, // e.g., "Kalanki Bus Stop"
            trim: true,
        },
        landmark: {
            type: String, // e.g., "Near Petrol Pump"
            trim: true,
        },
        coordinates: {
            lat: { type: Number },
            lng: { type: Number }
        },
        contactNumber: {
            type: String
        },
        type: {
            type: String,
            enum: ["BOARDING", "DROPPING", "BOTH"],
            default: "BOTH"
        },
        isGlobal: {
            type: Boolean,
            default: true // Super Admin created
        },
        ownerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User", // If a Brand wants to add their own private point
            required: false,
        },
        status: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true }
);

// Index for city-based searching
boardingPointsSchema.index({ city: 1, pointName: 1 });

module.exports = mongoose.model("BoardingPoints", boardingPointsSchema);
