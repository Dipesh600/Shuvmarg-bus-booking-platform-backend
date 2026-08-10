"use strict";

const SuperAdmin = require("../models/adminModel");

async function rootAdminMiddleware(req, res, next) {
  try {
    const admin = await SuperAdmin.findById(req.adminInfo?.id).lean();
    if (!admin || !admin.isRootAdmin || admin.lifecycleStatus !== "ACTIVE" || !admin.isActive) {
      return res.status(403).json({
        success: false,
        message: "This action requires the immutable root administrator.",
        errorCode: "ROOT_ADMIN_REQUIRED",
      });
    }
    req.adminInfo.isRootAdmin = true;
    return next();
  } catch (error) {
    return res.status(500).json({ success: false, message: "Unable to authorize root administrator" });
  }
}

module.exports = rootAdminMiddleware;
