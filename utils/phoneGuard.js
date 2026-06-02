/**
 * utils/phoneGuard.js
 * 
 * Global phone uniqueness enforcement.
 * Checks whether a phone number is already registered as ANY entity
 * (passenger, busOwner, agent, conductor, driver) in the User collection.
 * 
 * Since ALL entity types share the single User collection with a `role` field,
 * the phone `unique: true` index on userModel handles DB-level enforcement.
 * This utility provides a clean, readable application-level check with
 * descriptive error messages.
 */

const User = require("../models/userModel.js");

/**
 * Check if a phone number is already registered in the system.
 * 
 * @param {string} phone - The phone number to check
 * @returns {Promise<{registered: boolean, role: string|null}>}
 */
const isPhoneRegistered = async (phone) => {
    const user = await User.findOne({ phone, deletedAt: null }).select("role status").lean();
    if (!user) return { registered: false, role: null };
    return { registered: true, role: user.role, status: user.status };
};

/**
 * Middleware-style guard that blocks registration if phone already exists.
 * Attach to any OTP/registration route as middleware.
 * 
 * @param {string} [allowedRole] - If provided, only blocks if the phone is 
 *   registered under a DIFFERENT role. Pass null to block all re-registration.
 */
const phoneGuardMiddleware = (allowedRole = null) => {
    return async (req, res, next) => {
        const phone = req.body?.phone;
        
        if (!phone) {
            return res.status(400).json({
                success: false,
                message: "Phone number is required.",
            });
        }

        try {
            const { registered, role } = await isPhoneRegistered(phone);

            if (registered) {
                // If allowedRole is set, only block if existing role is different
                if (allowedRole && role === allowedRole) {
                    return next(); // Same role — let the specific handler deal with it
                }

                return res.status(409).json({
                    success: false,
                    message: "This phone number is already registered.",
                    errorCode: "PHONE_ALREADY_REGISTERED",
                });
            }

            next();
        } catch (error) {
            console.error("Phone guard error:", error);
            return res.status(500).json({
                success: false,
                message: "Internal server error during phone verification.",
            });
        }
    };
};

module.exports = { isPhoneRegistered, phoneGuardMiddleware };
