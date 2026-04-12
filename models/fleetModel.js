const mongoose = require("mongoose");

const BusSchema = new mongoose.Schema(
    {
        fleetId: {
            type: String,
            unique: true,
            index: true,
        },

        ownerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User", // Bus Owner
            required: true
        },

        busName: {
            type: String,
            required: true,
            trim: true
        },

        busNumber: {
            type: String,
            required: true,
            unique: true,
            uppercase: true
        },

        busType: {
            type: String,
            enum: ["AC", "NON_AC", "DELUXE", "SLEEPER", "SEMI_SLEEPER"],
            required: true
        },
        vehicleType: {
            type: String,
            enum: ["bus", "hiace"],
            required: true
        },
        totalSeats: {
            type: Number,
            required: true
        },

        seatLayout: {
            type: String,
            enum: ["2x1", "2x2", "1x1"],
            required: true
        },
        amenitiesId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "BusAmenities",
            default: null
        },

        boardingPointId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "BoardingPoints",
            default: null
        },


        fleetImages: {
            type: [String],
            default: []
        },

        registrationYear: {
            type: Number
        },

        status: {
            type: String,
            enum: ["ACTIVE", "INACTIVE", "MAINTENANCE"],
            default: "ACTIVE"
        },

        approvalStatus: {
            type: String,
            enum: ["PENDING", "APPROVED", "REJECTED"],
            default: "PENDING"
        },

        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "SuperAdmin",
            default: null
        },

        approvedAt: {
            type: Date,
            default: null
        },

        rejectedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "SuperAdmin",
            default: null
        },

        rejectedAt: {
            type: Date,
            default: null
        },

        rejectionReason: {
            type: String,
            default: null
        },

        createdBy: {
            type: String,
            default: "BUS_OWNER"
        }
    },
    {
        timestamps: true
    }
);

// Auto-generate human-readable Fleet ID: SUV-MARG-FLEET-ABC-001
BusSchema.pre("save", async function (next) {
    if (this.fleetId) return next();

    const prefix = "SUV-MARG-FLEET";
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

    const generateRandomPart = (length) => {
        let result = "";
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    };

    try {
        let uniqueIdFound = false;
        let candidate;

        while (!uniqueIdFound) {
            const randomCode = generateRandomPart(3);
            const randomNumber = String(Math.floor(Math.random() * 1000)).padStart(
                3,
                "0"
            );

            candidate = `${prefix}-${randomCode}-${randomNumber}`;

            const existing = await mongoose.model("Buse").findOne({ fleetId: candidate });
            if (!existing) {
                uniqueIdFound = true;
            }
        }

        this.fleetId = candidate;
        next();
    } catch (err) {
        next(err);
    }
});

module.exports = mongoose.model("Buse", BusSchema);
