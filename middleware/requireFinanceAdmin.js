"use strict";

// Runs after adminMiddleware, which refreshes activation, role and MFA from DB.
module.exports = function requireFinanceAdmin(req, res, next) {
  if (req.adminInfo?.role !== "SUPER_ADMIN" || req.adminInfo?.twoFactorEnabled !== true) {
    return res.status(403).json({ status: false, errorCode: "FINANCE_ACCESS_REQUIRED",
      message: "An administrator with finance authority and two-factor authentication is required." });
  }
  return next();
};
