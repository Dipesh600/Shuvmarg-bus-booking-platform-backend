const mongoose = require("mongoose");

const seatTemplateSchema = new mongoose.Schema({
    templateName: {
        type: String,
        required: true
    },

    totalSeats: {
        type: Number,
        required: true
    },

    // V2 architecture: Full rich seat map config
    seatConfig: {
        busShape: {
            type: String,
            enum: ["SINGLE_DECKER", "DOUBLE_DECKER", "SLEEPER_COACH", "MINI"],
            default: "SINGLE_DECKER"
        },
        layoutVariant: {
            type: String,
            default: "2x2"
        },
        hasKaKha: {
            type: Boolean,
            default: false
        },
        totalColumns: {
            type: Number,
            default: 5
        },
        floors: {
            type: [
                {
                    floorIndex: { type: Number },
                    rows: {
                        type: [
                            {
                                rowIndex: { type: Number },
                                rowType: {
                                    type: String,
                                    enum: ["DRIVER_CABIN", "DOOR_ROW", "SPACER", "SEAT_ROW", "BACK_ROW"],
                                    default: "SEAT_ROW"
                                },
                                rowLabel: { type: String, default: null },
                                hasKaKha: { type: Boolean, default: false },
                                cells: {
                                    type: [
                                        {
                                            colIndex: { type: Number },
                                            cellType: {
                                                type: String,
                                                enum: ["SEAT", "AISLE", "EMPTY", "DRIVER", "DOOR"],
                                                default: "SEAT"
                                            },
                                            seatId: { type: String, default: null },
                                            seatLabel: { type: String, default: null },
                                            labelScheme: { 
                                                type: String, 
                                                enum: ["KA_KHA", "ALPHA_NUM", "NUMERIC"],
                                                default: "NUMERIC" 
                                            },
                                            seatType: {
                                                type: String,
                                                enum: ["STANDARD", "SLEEPER_LOWER", "SLEEPER_UPPER", "SEMI_SLEEPER", "SOFA", "PRIORITY"],
                                                default: "STANDARD"
                                            },
                                            isActive: { type: Boolean, default: true },
                                            zone: {
                                                type: String,
                                                enum: ["LEFT", "RIGHT", "BACK", "DOOR_ADJACENT", null],
                                                default: null
                                            }
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

    // Legacy fields (kept optional for backwards compatibility before migration runs)
    seata: [{ seatNo: { type: String } }],
    seatb: [{ seatNo: { type: String } }],
    seatc: [{ seatNo: { type: String } }],

    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
    },
    createdById: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SuperAdmin",
    },

    isActive: {
        type: Boolean,
        default: true
    }

}, { timestamps: true });

module.exports = mongoose.model("SeatTemplate", seatTemplateSchema);
