const mongoose = require("mongoose");

const busAmenitiesSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        amenities: [
            {
                name: {
                    type: String,
                    required: true, // e.g., "WiFi"
                    trim: true,
                },
                description: {
                    type: String, // e.g., "Free high-speed internet"
                },
                icon: {
                    type: String, // Optional: URL or icon class name
                }
            },
        ],
        status: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("BusAmenities", busAmenitiesSchema);
