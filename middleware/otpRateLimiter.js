/**
 * middleware/otpRateLimiter.js
 *
 * Thin middleware wrapper — the heavy lifting is now done inside otpHelper.js
 * via the `blockedUntil` field on OTP documents.
 *
 * This middleware only validates that a phone/identifier is present before
 * passing to the controller. The actual send-rate enforcement is inside
 * createAndSendOTP(), which throws an OTP_SEND_BLOCKED error if the limit
 * has been hit. Controllers catch that error and return 429.
 *
 * Why this approach instead of a separate rate-limit collection?
 *  - Fewer DB round trips (no extra read before OTP creation)
 *  - Atomic — the rate check and OTP creation happen in the same document
 *  - No external Redis dependency required
 */

const validatePhonePresent = (req, res, next) => {
  const phone = req.body?.phone || req.body?.emailOrPhone;

  if (!phone) {
    return res.status(400).json({
      success: false,
      message: "Phone number is required.",
    });
  }

  next();
};

module.exports = validatePhonePresent;
