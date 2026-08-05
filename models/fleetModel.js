const mongoose = require("mongoose");
const fleetApprovalFields = require("./schemas/fleet-approval-fields");
const fleetDocumentFields = require("./schemas/fleet-document-fields");

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

        registrationYear: {
            type: Number
        },

        ...fleetDocumentFields,

        ...fleetApprovalFields,

        createdBy: {
            type: String,
            default: "BUS_OWNER"
        }
    },
    {
        timestamps: true
    }
);

/**
 * Hook 1 — Ownership invariant (runs only on INSERT).
 *
 * A Fleet document cannot be written to the database unless the operator
 * who owns it has a fully KYC-approved BusOwner profile.
 *
 * This is the canonical enforcement point for this constraint. It lives at
 * the Mongoose layer — below HTTP, below services — so no future API route,
 * admin script, seeder, or background job can accidentally bypass it.
 * Service-level guards are removed; this is the single source of truth.
 */
BusSchema.pre("save", async function (next) {
    if (!this.isNew) return next();

    const BusOwner = mongoose.model("BusOwner");
    const busOwner = await BusOwner.findOne({ user: this.ownerId })
        .select("verificationStatus")
        .lean();

    if (!busOwner) {
        return next(new Error(
            "OWNER_PROFILE_NOT_FOUND: No BusOwner profile exists for this user. " +
            "Complete KYC registration before adding a fleet."
        ));
    }

    if (busOwner.verificationStatus !== "approved") {
        return next(new Error(
            `OWNER_NOT_APPROVED: Fleet creation requires an approved BusOwner profile ` +
            `(current status: ${busOwner.verificationStatus}). ` +
            `Admin approval is required before you can register fleet vehicles.`
        ));
    }

    return next();
});

/**
 * Hook 2 — Auto-generate human-readable Fleet ID: SUV-MARG-FLEET-ABC-001
 */
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
            const randomNumber = String(Math.floor(Math.random() * 1000)).padStart(3, "0");
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
