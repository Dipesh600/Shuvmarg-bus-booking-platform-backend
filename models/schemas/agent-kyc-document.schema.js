"use strict";

const mongoose = require("mongoose");

/**
 * A single KYC document on an agent's application.
 *
 * Extracted from agentModel.js so that file stays under its size cap while the
 * agent-identity fields land. Behaviour is unchanged — same fields, same enum,
 * same defaults, still a subdocument array with its own `_id`.
 *
 * Files are stored as S3 object keys, never URLs; reads go through
 * getPresignedUrl(), matching bus owner KYC in s3Service.js.
 * S3 path: agents/{agentId}/kyc/{documentType}/
 */
const agentKycDocumentSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: [
            "citizenship_front",
            "citizenship_back",
            "national_id_front",
            "national_id_back",
            "shop_photo",
            "pan_card",
            "business_registration",
        ],
        required: true,
    },
    fileKey: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now },
    verified: { type: Boolean, default: false },
    verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SuperAdmin",
        default: null,
    },
    verifiedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: null },
});

module.exports = agentKycDocumentSchema;
