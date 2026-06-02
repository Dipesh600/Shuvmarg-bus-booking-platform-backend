/**
 * utils/otpHelper.js
 * 
 * Centralized OTP generation and verification logic.
 * All auth flows (passenger, busOwner, agent, password reset) 
 * must use these functions — never inline OTP logic.
 * 
 * Security measures:
 * - 6-digit OTP (900,000 combinations vs. old 4-digit 9,000)
 * - crypto.randomInt for cryptographically secure generation
 * - Constant-time comparison to prevent timing attacks
 * - Mandatory `purpose` field to prevent cross-flow OTP reuse
 */

const crypto = require("crypto");
const OTP = require("../models/otpModel.js");
const sendOTP = require("../handlers/sparro-otp.js");

const OTP_EXPIRY_MINUTES = 5;
const OTP_MAX_ATTEMPTS = 5;

/**
 * Generate a cryptographically secure 6-digit OTP.
 * @returns {string} 6-digit OTP as a string
 */
const generateOtpCode = () => {
    // crypto.randomInt is CSPRNG — far better than Math.random()
    const code = crypto.randomInt(100000, 999999);
    return String(code);
};

/**
 * Constant-time string comparison to prevent timing side-channel attacks.
 * @param {string} a 
 * @param {string} b 
 * @returns {boolean}
 */
const safeCompare = (a, b) => {
    if (typeof a !== "string" || typeof b !== "string") return false;
    if (a.length !== b.length) return false;
    
    const bufA = Buffer.from(a, "utf-8");
    const bufB = Buffer.from(b, "utf-8");
    return crypto.timingSafeEqual(bufA, bufB);
};

/**
 * Create and send an OTP for a given phone and purpose.
 * 
 * @param {string} phone - Phone number to send OTP to
 * @param {string} purpose - One of: REGISTRATION, PASSWORD_RESET, PHONE_CHANGE, ACCOUNT_ACTIVATION
 * @param {string} [messagePrefix] - Custom SMS prefix (default based on purpose)
 * @returns {Promise<{success: boolean, expiresIn: string}>}
 */
const createAndSendOTP = async (phone, purpose, messagePrefix = null) => {
    const otpCode = generateOtpCode();
    const otpExpiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    // Upsert: one active OTP per phone+purpose
    await OTP.findOneAndUpdate(
        { phone, purpose },
        {
            otp: otpCode,
            otpExpiry,
            isUsed: false,
            attempts: 0,
        },
        { upsert: true, new: true }
    );

    // Build SMS message
    const prefixMap = {
        REGISTRATION: "Your Sumarg Verification code is",
        PASSWORD_RESET: "Your Sumarg Password Reset code is",
        PHONE_CHANGE: "Your Sumarg Phone Change code is",
        ACCOUNT_ACTIVATION: "Your Sumarg Account Activation code is",
    };

    const prefix = messagePrefix || prefixMap[purpose] || "Your Sumarg code is";
    await sendOTP(phone, `${prefix}: ${otpCode}`);

    return {
        success: true,
        expiresIn: `${OTP_EXPIRY_MINUTES} minutes`,
    };
};

/**
 * Verify an OTP for a given phone and purpose.
 * Returns a detailed result object — never throws for expected failures.
 * 
 * @param {string} phone 
 * @param {string} otp 
 * @param {string} purpose 
 * @param {boolean} [markUsed=true] - Whether to mark OTP as used after success
 * @returns {Promise<{valid: boolean, error: string|null}>}
 */
const verifyOTPCode = async (phone, otp, purpose, markUsed = true) => {
    const otpRecord = await OTP.findOne({ phone, purpose });

    if (!otpRecord) {
        return { valid: false, error: "OTP not found. Please request a new OTP." };
    }

    // Check expiry
    if (otpRecord.isExpired()) {
        return { valid: false, error: "OTP has expired. Please request a new one." };
    }

    // Check if already used
    if (otpRecord.isUsed) {
        return { valid: false, error: "OTP has already been used. Please request a new one." };
    }

    // Check max attempts
    if (otpRecord.attempts >= otpRecord.maxAttempts) {
        return { valid: false, error: "Maximum OTP attempts exceeded. Please request a new one." };
    }

    // Constant-time comparison
    if (!safeCompare(String(otpRecord.otp), String(otp))) {
        await otpRecord.incrementAttempts();
        const remaining = otpRecord.maxAttempts - (otpRecord.attempts); // already incremented
        return { 
            valid: false, 
            error: `Invalid OTP. ${remaining} attempt(s) remaining.`,
        };
    }

    // Success — mark as used if requested
    if (markUsed) {
        await otpRecord.markAsUsed();
    }

    return { valid: true, error: null };
};

module.exports = {
    generateOtpCode,
    safeCompare,
    createAndSendOTP,
    verifyOTPCode,
    OTP_EXPIRY_MINUTES,
};
