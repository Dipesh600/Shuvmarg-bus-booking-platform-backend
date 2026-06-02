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

        // [NEW] Links this bus to its OperatorBrand (commercial identity)
        // Required for all new fleet. Legacy fleet migrated via script.
        brandId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "OperatorBrand",
            default: null,
            index: true,
        },

        setupComplete: {
            type: Boolean,
            default: false,
        },

        // Fleet grouping — buses sharing route, layout, amenities
        fleetGroupId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Buse",    // Self-reference for cloning config
            default: null,
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
            enum: ["bus", "hiace", "minibus", "jeep"],
            required: true
        },
        // Rich, booking-engine-ready seat configuration.
        // Replaces the old flat `totalSeats` + `seatLayout` string fields.
        totalSeats: {
            type: Number,
            required: true,
            min: 1
        },

        seatConfig: {
            busShape: {
                type: String,
                enum: ["SINGLE_DECKER", "DOUBLE_DECKER", "SLEEPER_COACH", "MINI"],
                default: "SINGLE_DECKER"
            },
            // Each floor is an array of rows. Double Deckers have 2 floors.
            floors: {
                type: [
                    {
                        floorIndex: { type: Number },
                        rows: {
                            type: [
                                {
                                    rowIndex: { type: Number },
                                    // STRUCTURAL rows: DRIVER_CABIN, DOOR, SPACER
                                    // SEAT rows: the actual passenger seats
                                    rowType: {
                                        type: String,
                                        enum: ["DRIVER_CABIN", "DOOR", "DOOR_ROW", "SPACER", "SEAT_ROW", "BACK_ROW"],
                                        default: "SEAT_ROW"
                                    },
                                    cells: {
                                        type: [
                                            {
                                                colIndex: { type: Number },
                                                cellType: {
                                                    type: String,
                                                    enum: ["SEAT", "AISLE", "EMPTY", "DRIVER", "DOOR"],
                                                    default: "SEAT"
                                                },
                                                // Only populated if cellType === "SEAT"
                                                seatId: { type: String, default: null },
                                                seatLabel: { type: String, default: null },
                                                seatType: {
                                                    type: String,
                                                    enum: ["STANDARD", "SLEEPER_LOWER", "SLEEPER_UPPER", "SEMI_SLEEPER", "SOFA", "PRIORITY"],
                                                    default: "STANDARD"
                                                },
                                                // Booking engine state — not set at registration time
                                                isActive: { type: Boolean, default: true },
                                            }
                                        ],
                                        default: []
                                    }
                                }
                            ],
                            default: []
                        }
                    }
                ],
                default: []
            }
        },
        amenitiesId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "BusAmenities",
            default: null
        },

        // Individual amenities selected from the global catalog
        amenityIds: {
            type: [{ type: mongoose.Schema.Types.ObjectId, ref: "BusAmenities" }],
            default: [],
        },

        boardingPointId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "BoardingPoints",
            default: null
        },

        // Platform Route Corridor (replaces isolated busRoute)
        corridorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "RouteCorridor",
            default: null,
            index: true
        },

        // If the owner requested a new route not in platform registry
        routeRequestId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "RouteRequest",
            default: null,
            index: true
        },

        fleetImages: {
            type: [String],
            default: []
        },

        // Denormalized rating (updated on review creation via aggregation)
        averageRating: {
            type: Number,
            default: 0,
            min: 0,
            max: 5,
        },
        totalReviews: {
            type: Number,
            default: 0,
            min: 0,
        },

        // Per-vehicle legal documents (separate from owner-level KYC)
        fleetDocuments: {
            fitnessCert: {
                url: { type: String, default: null },
                validTill: { type: Date, default: null },
            },
            insurance: {
                url: { type: String, default: null },
                policyNumber: { type: String, default: null },
                validTill: { type: Date, default: null },
            },
            bluebook: {
                url: { type: String, default: null },
            },
            routePermit: {
                url: { type: String, default: null },
                validTill: { type: Date, default: null },
            },
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

        // ── Per-document review results (set by admin during KYC review) ────────
        // Each key maps to a document slot. Status: 'pending' | 'approved' | 'rejected'
        // This is what the bus owner actually sees when their application is rejected
        // so they know exactly which file to fix and re-upload.
        documentReviews: {
            fleetImages:  { status: { type: String, default: "pending" }, reason: { type: String, default: null } },
            fitnessCert:  { status: { type: String, default: "pending" }, reason: { type: String, default: null } },
            insurance:    { status: { type: String, default: "pending" }, reason: { type: String, default: null } },
            bluebook:     { status: { type: String, default: "pending" }, reason: { type: String, default: null } },
            routePermit:  { status: { type: String, default: "pending" }, reason: { type: String, default: null } },
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
