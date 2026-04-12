const mongoose = require("mongoose");

const boardingPointsSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        // The main location or city this set of points belongs to (Optional recommendation)
        city: {
            type: String,
            trim: true,
        },
        boardingPoints: [
            {
                pointName: {
                    type: String,
                    required: true, // e.g., "Kalanki Bus Stop"
                },
                landmark: {
                    type: String, // e.g., "Near Petrol Pump"
                },
                time: {
                    type: String, // e.g "4:45 PM"
                    required: true
                },
                // Coordinates can be useful for map integration
                coordinates: {
                    lat: { type: Number },
                    lng: { type: Number }
                },
                contactNumber: {
                    type: String // Contact person at this boarding point
                }
            },
        ],
        description: {
            type: String, // General description for this collection of points
        },
        status: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("BoardingPoints", boardingPointsSchema);
