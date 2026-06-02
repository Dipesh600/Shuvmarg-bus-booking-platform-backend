const mongoose = require("mongoose");

const busAmenitiesSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true, // e.g., "WiFi"
            trim: true,
            unique: true,
        },
        description: {
            type: String, // e.g., "Free high-speed internet"
        },
        icon: {
            type: String, // URL or CSS class name
        },
        type: {
            type: String,
            enum: ["GLOBAL", "CUSTOM"],
            default: "GLOBAL",
        },
        ownerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User", // Null for GLOBAL
            required: false,
        },
        status: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("BusAmenities", busAmenitiesSchema);
