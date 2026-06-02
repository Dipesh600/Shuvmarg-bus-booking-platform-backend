/**
 * models/refreshTokenModel.js
 * 
 * Stores active refresh tokens for session management.
 * 
 * Design decisions:
 * - Token is stored as a SHA-256 hash (never store raw tokens in DB)
 * - One user can have multiple refresh tokens (multi-device support)
 * - TTL index auto-deletes expired tokens from MongoDB
 * - On logout: delete the specific refresh token
 * - On password change / ban / role revoke: delete ALL tokens for user
 */

const mongoose = require("mongoose");

const refreshTokenSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        tokenHash: {
            type: String,
            required: true,
            unique: true,
        },
        expiresAt: {
            type: Date,
            required: true,
        },
        deviceInfo: {
            type: String,
            default: null, // User-Agent string
        },
        ipAddress: {
            type: String,
            default: null,
        },
    },
    { timestamps: true }
);

// TTL index — MongoDB automatically removes expired tokens
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("RefreshToken", refreshTokenSchema);
