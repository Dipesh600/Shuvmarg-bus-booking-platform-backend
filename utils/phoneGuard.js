const { getEffectiveRoles } = require('../src/shared/auth/account-role.policy');
/**
 * utils/phoneGuard.js
 *
 * Role-aware phone registration checking for the multi-role identity system.
 *
 * DESIGN:
 *   One phone = one User = many roles.
 *   When a phone is "registered", it might only be registered for SOME roles.
 *   A passenger can still register as an agent with the same phone.
 *
 * Phone normalization:
 *   Nepal phones can arrive as 9803643115, +9779803643115, 9779803643115, or 09803643115.
 *   normalizePhone() strips all these down to a consistent 10-digit local format.
 *   All DB lookups search for BOTH the raw input AND the normalized form.
 *
 * Key functions:
 *   - normalizePhone(phone) — strips country code, whitespace, dashes
 *   - checkPhoneForRole(phone, targetRole) — the primary check
 *   - isPhoneRegistered(phone) — legacy compat wrapper (still blocks all)
 *   - phoneGuardMiddleware(targetRole) — Express middleware version
 */

const User = require("../models/userModel.js");

/**
 * Normalize a Nepal phone number to a consistent local format.
 *
 * Handles these common input variants:
 *   +9779803643115  →  9803643115
 *   9779803643115   →  9803643115
 *   09803643115     →  9803643115
 *   9803643115      →  9803643115  (no change)
 *   +977-980-364-3115 → 9803643115
 *
 * @param {string} phone - Raw phone input
 * @returns {string} Normalized phone number
 */
const normalizePhone = (phone) => {
    if (!phone) return phone;

    // Remove all whitespace, dashes, parentheses
    let cleaned = String(phone).replace(/[\s\-\(\)]/g, "");

    // Strip +977 or 977 country code prefix (Nepal)
    if (cleaned.startsWith("+977")) {
        cleaned = cleaned.slice(4);
    } else if (cleaned.startsWith("977") && cleaned.length > 10) {
        cleaned = cleaned.slice(3);
    }

    // Strip leading 0 (trunk prefix)
    if (cleaned.startsWith("0") && cleaned.length === 11) {
        cleaned = cleaned.slice(1);
    }

    return cleaned;
};

/**
 * Build a phone query matching both raw and normalized forms.
 * @param {string} phone - Raw phone input
 * @param {boolean} [options.includeDeleted=false] - When true, includes soft-deleted records.
 *   Default false — existing callers always exclude deleted users.
 * @returns {Object} MongoDB query filter
 */
const buildPhoneQuery = (phone, options = {}) => {
    const normalized = normalizePhone(phone);
    const raw = String(phone).trim();
    const includeDeleted = Boolean(options.includeDeleted);

    const phoneFilter = normalized === raw
        ? { phone: raw }
        : { phone: { $in: [raw, normalized] } };

    if (includeDeleted) return phoneFilter;
    return { ...phoneFilter, deletedAt: null };
};

/**
 * Check phone registration status with role awareness.
 *
 * @param {string} phone - The phone number to check
 * @param {string} targetRole - The role the caller wants to register for
 * @returns {Promise<{
 *   exists: boolean,        // User record exists in DB
 *   hasRole: boolean,       // User already has the targetRole
 *   user: Object|null,      // User doc (lean) if exists — includes name for UX
 * }>}
 */
const checkPhoneForRole = async (phone, targetRole, options = {}) => {
    const query = buildPhoneQuery(phone, options);
    const user = await User.findOne(query)
        .select("name role roles status phone")
        .lean();

    if (!user) return { exists: false, hasRole: false, user: null };

    const roles = getEffectiveRoles(user);

    return {
        exists: true,
        hasRole: roles.includes(targetRole),
        user,
    };
};

/**
 * Legacy wrapper — checks if phone is registered under ANY role.
 * Used by passenger registration (which SHOULD block if phone exists at all,
 * since passengers are always new-to-platform signups).
 *
 * @param {string} phone
 * @returns {Promise<{registered: boolean, role: string|null}>}
 */
const isPhoneRegistered = async (phone) => {
    const query = buildPhoneQuery(phone);
    const user = await User.findOne(query)
        .select("role status")
        .lean();
    if (!user) return { registered: false, role: null };
    return { registered: true, role: user.role, status: user.status };
};

/**
 * Middleware-style guard for role-specific registration routes.
 *
 * Behavior depends on targetRole:
 *   - If targetRole is "passenger": blocks if phone exists at all (new-to-platform only)
 *   - If targetRole is "agent"/"busOwner"/etc: blocks only if phone already has that role
 *     If phone exists with a DIFFERENT role, allows through (upgrade flow)
 *
 * Attaches `req.existingUser` if the phone belongs to an existing user (for upgrade flow).
 * Also normalizes `req.body.phone` to the canonical form for consistent storage.
 *
 * @param {string} targetRole - The role being registered for
 */
const phoneGuardMiddleware = (targetRole) => {
    return async (req, res, next) => {
        const phone = req.body?.phone;

        if (!phone) {
            return res.status(400).json({
                success: false,
                message: "Phone number is required.",
            });
        }

        // Normalize the phone in the request body for consistent downstream storage
        req.body.phone = normalizePhone(phone);

        try {
            const { exists, hasRole, user } = await checkPhoneForRole(phone, targetRole);

            if (!exists) {
                // Phone is new — allow registration
                return next();
            }

            if (hasRole) {
                // Already registered for this specific role
                return res.status(409).json({
                    success: false,
                    message: `This phone number is already registered as ${targetRole}.`,
                    errorCode: "ROLE_ALREADY_REGISTERED",
                });
            }

            // Phone exists but doesn't have this role — upgrade flow
            // Attach existing user to request for downstream "Find-or-Upgrade" logic
            req.existingUser = user;
            return next();
        } catch (error) {
            console.error("Phone guard error:", error);
            return res.status(500).json({
                success: false,
                message: "Internal server error during phone verification.",
            });
        }
    };
};

module.exports = { normalizePhone, buildPhoneQuery, checkPhoneForRole, isPhoneRegistered, phoneGuardMiddleware };
