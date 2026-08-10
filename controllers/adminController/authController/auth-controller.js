"use strict";

const SuperAdmin = require("../../../models/adminModel");
const { loginAdmin } = require("../../../src/modules/admin/auth-security/admin-login.service");
const {
  beginRootEnrollment, confirmRootEnrollment,
} = require("../../../src/modules/admin/auth-security/admin-bootstrap-enrollment.service");

const context = (req) => ({
  ipAddress: req.ip,
  userAgent: req.get("user-agent") || null,
});

function sendError(res, error) {
  return res.status(error.statusCode || 500).json({
    success: false,
    message: error.statusCode ? error.message : "Internal Server Error",
    errorCode: error.code || "ADMIN_AUTH_FAILED",
  });
}

async function login(req, res) {
  try {
    if ((!req.body.adminId && !req.body.email) || !req.body.password) {
      return res.status(400).json({ success: false, message: "Credentials are required" });
    }
    const result = await loginAdmin(req.body, context(req));
    return res.status(200).json({ success: true, message: "Admin login successful", ...result });
  } catch (error) {
    return sendError(res, error);
  }
}

async function beginBootstrapMfa(req, res) {
  try {
    const result = await beginRootEnrollment({
      token: req.body.token, password: req.body.password, requestContext: context(req),
    });
    res.set("Cache-Control", "no-store");
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return sendError(res, error);
  }
}

async function confirmBootstrapMfa(req, res) {
  try {
    const result = await confirmRootEnrollment({
      token: req.body.token, otp: req.body.otp, requestContext: context(req),
    });
    res.set("Cache-Control", "no-store");
    return res.status(200).json({
      success: true,
      message: "Root administrator activated. Store the recovery codes securely.",
      data: result,
    });
  } catch (error) {
    return sendError(res, error);
  }
}

async function getAdminProfile(req, res) {
  try {
    const admin = await SuperAdmin.findById(req.adminInfo.id).select(
      "-password -twoFactorSecret -encryptedTwoFactorSecret -recoveryCodeHashes"
    );
    if (!admin) return res.status(404).json({ success: false, message: "Admin not found" });
    return res.status(200).json({ success: true, data: admin });
  } catch (error) {
    return sendError(res, error);
  }
}

module.exports = { beginBootstrapMfa, confirmBootstrapMfa, getAdminProfile, login };
