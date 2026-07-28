/**
 * middleware/requireApprovedBusOwner.js
 *
 * DB-level authorization middleware for busOwner-only routes that require
 * a FULLY APPROVED KYC profile before access is granted.
 *
 * Sits after `auth`, `verifyRoleFromDB`, and `busOwnerMiddleware`.
 * 
 * Applied to: Operational routes (fleets, routes, trips, tickets)
 * NOT applied to: /submitBusOwnerKyc, /myBusOwnerKycStatus (accessible while pending)
 */

"use strict";

const BusOwner = require("../models/busOwnerModel.js");

const requireApprovedBusOwner = async (req, res, next) => {
    try {
        const userId = req.userInfo?.id;
        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized." });
        }

        const busOwner = await BusOwner.findOne({ user: userId })
            .select("verificationStatus")
            .lean();

        if (!busOwner) {
            return res.status(403).json({
                success: false,
                message: "No bus operator profile found. Please complete your registration.",
                errorCode: "NO_PROFILE",
                verificationStatus: null,
            });
        }

        if (busOwner.verificationStatus !== "approved") {
            const messageMap = {
                pending:   "Your profile is under review. You will be notified once it is approved.",
                rejected:  "Your profile was not approved. Please contact support.",
                suspended: "Your bus operator account has been suspended. Please contact support.",
            };

            return res.status(403).json({
                success: false,
                message: messageMap[busOwner.verificationStatus] || "Access denied. Your profile is not approved.",
                errorCode: "PROFILE_NOT_APPROVED",
                verificationStatus: busOwner.verificationStatus,
            });
        }

        // ✅ Approved — allow through
        next();
    } catch (error) {
        console.error("[requireApprovedBusOwner] Error:", error.message);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

module.exports = requireApprovedBusOwner;
