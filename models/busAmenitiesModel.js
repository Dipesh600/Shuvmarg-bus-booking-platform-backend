const mongoose = require("mongoose");

const busAmenitiesSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            unique: true,
            minlength: 2,
            maxlength: 60,
        },
        description: {
            type: String,
            trim: true,
            maxlength: 240,
        },
        icon: {
            type: String,
            trim: true,
            maxlength: 50,
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
