/**
 * utils/verificationToken.js
 *
 * Short-lived, signed verification tokens issued at verifyOTP (Step 2) and
 * consumed at register (Step 3).
 *
 * SECURITY DESIGN — AUTH-01.02 (Registration proof not bound to requestor)
 *
 * Problem:
 *   After a victim calls verifyOTP, the OTP record is marked isUsed:true in MongoDB.
 *   Registration (Step 3) only checked that a used record exists for the phone;
 *   it did not require the caller to prove it was the same HTTP client that verified
 *   the OTP. A second requester knowing the victim's phone number could race in and
 *   complete registration with a different password within the 30-minute window.
 *
 * Fix:
 *   verifyOTP now issues a signed JWT (the "verification token") containing:
 *     - phone (normalized — must match registration request)
 *     - purpose (must match the registration purpose — prevents cross-flow reuse)
 *     - nonce (crypto.randomBytes — ensures every token is unique)
 *   The token is signed with VERIFICATION_TOKEN_SECRET (separate from JWT_SECRET).
 *   It expires in 30 minutes.
 *
 *   register (Step 3) validates the token before the OTP-record lookup.
 *   Without the token, or with a token for a different phone/purpose, registration fails.
 *
 * Completion reserves each signed proof in ConsumedRegistrationProof before
 * writes. A nonce makes tokens unique; the database prevents replay.
 *
 * Env variable:
 *   VERIFICATION_TOKEN_SECRET — required. The server refuses to boot without it.
 *   Keep it separate from JWT_SECRET so rotating one does not affect the other.
 */

"use strict";

const crypto = require("crypto");
const jwt    = require("jsonwebtoken");

const VERIFICATION_TOKEN_SECRET = process.env.VERIFICATION_TOKEN_SECRET;
if (!VERIFICATION_TOKEN_SECRET) {
    throw new Error(
        "[verificationToken] VERIFICATION_TOKEN_SECRET environment variable is required " +
        "but is not set. Set it in your .env file and restart the server."
    );
}

const EXPIRY = "30m";

/**
 * Issue a signed verification token after successful OTP verification.
 *
 * @param {string} phone     - Normalized phone number that was verified.
 * @param {string} purpose   - OTP purpose (e.g. "REGISTRATION", "BUSOWNER_REGISTRATION").
 * @returns {string}         - Signed JWT string.
 */
const issueVerificationToken = (phone, purpose) => {
    return jwt.sign(
        {
            phone,
            purpose,
            nonce: crypto.randomBytes(16).toString("hex"),
        },
        VERIFICATION_TOKEN_SECRET,
        { expiresIn: EXPIRY }
    );
};

/**
 * Validate a verification token at the registration step.
 *
 * Checks:
 *   1. JWT signature is valid.
 *   2. Token has not expired.
 *   3. phone claim matches the phone submitted in the registration request.
 *   4. purpose claim matches the expected registration purpose.
 *
 * @param {string} token           - JWT from the request body.
 * @param {string} expectedPhone   - Normalized phone from registration request body.
 * @param {string} expectedPurpose - Expected OTP purpose for this registration flow.
 * @returns {{ valid: boolean, error?: string }}
 */
const validateVerificationToken = (token, expectedPhone, expectedPurpose) => {
    if (!token || typeof token !== "string") {
        return { valid: false, error: "Verification token is required. Please complete OTP verification first." };
    }

    let decoded;
    try {
        decoded = jwt.verify(token, VERIFICATION_TOKEN_SECRET);
    } catch (err) {
        if (err.name === "TokenExpiredError") {
            return { valid: false, error: "Verification session expired. Please verify your phone number again." };
        }
        return { valid: false, error: "Invalid verification token. Please complete OTP verification first." };
    }

    if (decoded.phone !== expectedPhone) {
        return { valid: false, error: "Verification token does not match the submitted phone number." };
    }

    if (decoded.purpose !== expectedPurpose) {
        return { valid: false, error: "Invalid verification token for this registration type." };
    }

    if (!Number.isInteger(decoded.exp) || typeof decoded.nonce !== "string" || !decoded.nonce) {
        return { valid: false, error: "Invalid verification token. Please verify your phone again." };
    }
    return { valid: true, expiresAt: decoded.exp };
};

module.exports = { issueVerificationToken, validateVerificationToken };
