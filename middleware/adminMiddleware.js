/**
 * middleware/adminMiddleware.js
 *
 * JWT verification + DB-backed admin authorization.
 *
 * Checks:
 *   1. JWT is valid and not expired
 *   2. Admin exists in the SuperAdmin collection
 *   3. Admin account is active (not locked)
 *   4. Admin role matches JWT claim (prevents stale tokens)
 *   5. Attaches fresh admin data to req.adminInfo
 */

const jwt = require("jsonwebtoken");
const SuperAdmin = require("../models/adminModel.js");

const superAdminAuthMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers["authorization"];
        const token = authHeader && authHeader.split(" ")[1];

        if (!token) {
            return res.status(400).json({
                status: false,
                message: "Authorization header is missing or invalid",
            });
        }

        const decoded = jwt.verify(token, process.env.SECRET_KEY);
        req.adminInfo = decoded;

        // ── JWT Role Check (fast, stateless) ──────────────────────────────────
        if (
            req.adminInfo.role !== "SUPER_ADMIN" &&
            req.adminInfo.role !== "ADMIN" &&
            req.adminInfo.role !== "SUB_ADMIN"
        ) {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin privileges required.",
            });
        }

        // ── DB Verification (catches locked/deactivated admins) ───────────────
        const admin = await SuperAdmin.findById(decoded.id).lean();

        if (!admin) {
            return res.status(401).json({
                success: false,
                message: "Admin account not found. Token may be invalid.",
            });
        }

        if (!admin.isActive) {
            return res.status(403).json({
                success: false,
                message: "Admin account has been deactivated.",
                errorCode: "ADMIN_DEACTIVATED",
            });
        }

        if (admin.accountLocked) {
            return res.status(403).json({
                success: false,
                message: "Admin account is locked due to security policy.",
                errorCode: "ADMIN_LOCKED",
            });
        }

        // Role drift check — if admin role was changed, force re-login
        if (decoded.role !== admin.role) {
            return res.status(403).json({
                success: false,
                message: "Your admin role has been updated. Please login again.",
                errorCode: "ROLE_MISMATCH",
            });
        }

        // Attach fresh DB admin (without password) to request
        req.adminInfo = {
            ...decoded,
            isActive: admin.isActive,
            twoFactorEnabled: admin.twoFactorEnabled,
        };

        next();
    } catch (error) {
        if (error.name === "TokenExpiredError") {
            return res.status(401).json({
                success: false,
                message: "Admin session expired. Please login again.",
            });
        }
        console.error("Admin auth middleware error:", error);
        return res.status(401).json({
            status: false,
            message: "Unauthorized: Invalid or expired token",
        });
    }
};

module.exports = superAdminAuthMiddleware;