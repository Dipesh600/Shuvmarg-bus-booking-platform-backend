/**
 * middleware/checkRole.js
 *
 * Role authorization middleware for the multi-role identity system.
 *
 * Uses `req.userInfo.activeRole` (set by authMiddleware from JWT) to check
 * if the current session has permission to access a route.
 *
 * Usage:
 *   router.get("/dashboard", auth, requireRole("agent"), handler);
 *   router.get("/fleet", auth, requireRole("busOwner"), handler);
 *   router.post("/approve", auth, requireRole("busOwner", "admin"), handler);
 */

/**
 * Role authorization middleware factory.
 * Checks if the JWT's activeRole is one of the allowed roles.
 *
 * @param  {...string} allowedRoles - Roles that can access this route
 * @returns {Function} Express middleware
 */
const requireRole = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.userInfo) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized. Please login first.",
            });
        }

        // Use activeRole (multi-role system) with fallback to role (legacy JWTs)
        const activeRole = req.userInfo.activeRole || req.userInfo.role;

        if (!activeRole || !allowedRoles.includes(activeRole)) {
            return res.status(403).json({
                success: false,
                message: `Access denied. Required: ${allowedRoles.join(" or ")}.`,
                errorCode: "INSUFFICIENT_ROLE",
            });
        }

        next();
    };
};

// ── Backward-compatible aliases ──────────────────────────────────────────
// These are drop-in replacements for the old per-role middleware functions.
// All existing route files that use e.g. `agentMiddleware` continue to work.
//
// NOTE: "admin" is NOT here — admin authorization uses the separate
// adminMiddleware.js (SuperAdmin JWT), not User JWT role checks.

const busOwnerMiddleware = requireRole("busOwner");
const agentMiddleware = requireRole("agent");
const conductorMiddleware = requireRole("conductor");
const driverMiddleware = requireRole("driver");

module.exports = {
    requireRole,
    agentMiddleware,
    busOwnerMiddleware,
    conductorMiddleware,
    driverMiddleware,
};
