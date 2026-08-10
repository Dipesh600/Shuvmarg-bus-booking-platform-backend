"use strict";

const SuperAdmin = require("../../../../models/adminModel");
const {
  beginInvitationEnrollment, confirmInvitationEnrollment, createInvitation,
} = require("./admin-invitation.service");
const { setAdministratorStatus } = require("./admin-lifecycle.service");

const context = (req) => ({ ipAddress: req.ip, userAgent: req.get("user-agent") || null });
const fail = (res, error) => res.status(error.statusCode || 500).json({
  success: false,
  message: error.statusCode ? error.message : "Administrator operation failed",
  errorCode: error.code || "ADMIN_OPERATION_FAILED",
});

async function invite(req, res) {
  try {
    const data = await createInvitation(req.body, req.adminInfo.id, context(req));
    res.set("Cache-Control", "no-store");
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return fail(res, error);
  }
}

async function list(req, res) {
  const admins = await SuperAdmin.find({}).select(
    "adminId email role isRootAdmin lifecycleStatus isActive twoFactorEnabled lastLoginAt createdAt"
  ).sort({ isRootAdmin: -1, createdAt: 1 }).lean();
  return res.status(200).json({ success: true, data: admins });
}

async function begin(req, res) {
  try {
    const data = await beginInvitationEnrollment({ ...req.body }, context(req));
    res.set("Cache-Control", "no-store");
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return fail(res, error);
  }
}

async function confirm(req, res) {
  try {
    const data = await confirmInvitationEnrollment({ ...req.body }, context(req));
    res.set("Cache-Control", "no-store");
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return fail(res, error);
  }
}

async function updateStatus(req, res) {
  try {
    const admin = await setAdministratorStatus(
      req.params.adminId, req.body.status, req.adminInfo.id, context(req)
    );
    return res.status(200).json({ success: true, data: {
      id: admin._id, lifecycleStatus: admin.lifecycleStatus, isActive: admin.isActive,
    } });
  } catch (error) {
    return fail(res, error);
  }
}

module.exports = { begin, confirm, invite, list, updateStatus };
