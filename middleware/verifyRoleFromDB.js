/**
 * middleware/verifyRoleFromDB.js
 *
 * DB-backed authorization middleware. Solves the critical security gap where
 * the old authMiddleware blindly trusts the JWT payload.
 *
 * Problem it solves:
 *   - User gets banned → JWT still has role: "busOwner" → can access routes until expiry
 *   - User's role is changed → JWT still has old role → bypasses new role checks
 *   - User is soft-deleted → JWT still valid → ghost sessions
 *   - User has forcePasswordChange → JWT still grants full access
 *
 * This middleware runs AFTER authMiddleware (JWT verification) and:
 *   1. Loads the user from DB by the JWT's `id` claim
 *   2. Checks account status (banned, deleted, inactive, invited)
 *   3. Verifies role matches the JWT's role claim (catches stale JWTs)
 *   4. Checks forcePasswordChange flag
 *   5. Attaches the fresh DB user to req.dbUser for downstream handlers
 *
 * Usage:
 *   router.post("/sensitive", auth, verifyRoleFromDB, handler);
 *   router.post("/owner-only", auth, verifyRoleFromDB, busOwnerMiddleware, handler);
 *
 * Performance note:
 *   One extra DB read per request. Use on sensitive/write routes.
 *   For read-heavy public routes, authMiddleware alone is sufficient.
 */

const User = require("../models/userModel.js");

const verifyRoleFromDB = async (req, res, next) => {
    try {
        const userId = req.userInfo?.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized. Token payload missing user ID.",
            });
        }

        const user = await User.findById(userId).lean();

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "User not found. Your account may have been removed.",
                errorCode: "USER_NOT_FOUND",
            });
        }

        // === SOFT-DELETE CHECK ===
        if (user.deletedAt) {
            return res.status(403).json({
                success: false,
                message: "This account has been deactivated. Contact support.",
                errorCode: "ACCOUNT_DEACTIVATED",
            });
        }

        // === STATUS CHECKS ===
        if (user.status === "banned") {
            return res.status(403).json({
                success: false,
                message: "Your account has been banned. Contact support.",
                errorCode: "ACCOUNT_BANNED",
            });
        }

        if (user.status === "inactive") {
            return res.status(403).json({
                success: false,
                message: "Your account is inactive. Contact support.",
                errorCode: "ACCOUNT_INACTIVE",
            });
        }

        if (user.status === "invited") {
            return res.status(403).json({
                success: false,
                message: "Your account has not been activated yet. Please activate your account first.",
                errorCode: "ACCOUNT_NOT_ACTIVATED",
            });
        }

        // === ROLE DRIFT CHECK (multi-role aware) ===
        // Verify the activeRole in this JWT is still in the user's roles array.
        // This catches: role revoked by admin, stale JWTs after role removal.
        const activeRole = req.userInfo.activeRole || req.userInfo.role;
        if (activeRole && user.roles && !user.roles.includes(activeRole)) {
            return res.status(403).json({
                success: false,
                message: "Your role has been revoked. Please login again.",
                errorCode: "ROLE_REVOKED",
            });
        }

        // === TOKEN VERSION CHECK ===
        // Access tokens carry the tokenVersion from the moment they were minted.
        // On logout or password change the DB counter is incremented ($inc).
        // A token with a lower version than the DB value was issued before the
        // last invalidation event and is therefore no longer valid, even if its
        // cryptographic signature and expiry are both fine.
        // Cost: zero extra DB reads — the user document is already in memory above.
        const tokenVersion = req.userInfo.tokenVersion ?? 0;
        if (tokenVersion !== user.tokenVersion) {
            return res.status(401).json({
                success: false,
                message: "Your session is no longer valid. Please login again.",
                errorCode: "SESSION_INVALIDATED",
            });
        }

        // === FORCE PASSWORD CHANGE CHECK ===
        if (user.forcePasswordChange) {
            return res.status(403).json({
                success: false,
                message: "You must change your password before accessing this resource.",
                errorCode: "FORCE_PASSWORD_CHANGE",
                forcePasswordChange: true,
            });
        }

        // Attach fresh DB user to request for downstream handlers
        req.dbUser = user;

        next();
    } catch (error) {
        console.error("verifyRoleFromDB middleware error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error during authorization.",
        });
    }
};

module.exports = verifyRoleFromDB;
