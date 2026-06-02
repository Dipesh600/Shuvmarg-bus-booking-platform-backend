/**
 * middleware/otpRateLimiter.js
 * 
 * Enforces OTP generation limits per phone number:
 * - Max 3 requests per 10 minutes (uses the OTP model as the data store)
 * - Prevents SMS bombing, phone enumeration, and SMS credit exhaustion
 */

const OTP = require("../models/otpModel");

const OTP_WINDOW_MS = 10 * 60 * 1000;  // 10 minutes
const MAX_OTP_REQUESTS = 3;

const otpRateLimiter = async (req, res, next) => {
    const phone = req.body?.phone || req.body?.emailOrPhone;

    if (!phone) {
        return res.status(400).json({ success: false, message: "Phone number or identifier is required" });
    }

    try {
        const windowStart = new Date(Date.now() - OTP_WINDOW_MS);

        // Count OTP documents created for this phone in the last 10 minutes
        const recentCount = await OTP.countDocuments({
            phone,
            createdAt: { $gte: windowStart }
        });

        if (recentCount >= MAX_OTP_REQUESTS) {
            const cooldownMinutes = Math.ceil(OTP_WINDOW_MS / 60000);
            return res.status(429).json({
                success: false,
                message: `Too many OTP requests. Please wait ${cooldownMinutes} minutes before requesting again.`,
                errorCode: "OTP_RATE_LIMIT_EXCEEDED",
                retryAfterMinutes: cooldownMinutes,
            });
        }

        next();
    } catch (e) {
        console.error("OTP rate limiter error:", e);
        next(); // Fail open — don't block users if DB is unavailable
    }
};

module.exports = otpRateLimiter;
