"use strict";

const Admin = require("../../../../models/adminModel");

const ALLOWED_ADMIN_ROLES = Object.freeze(["SUPER_ADMIN", "ADMIN", "SUB_ADMIN"]);

function getAdminActor(req) {
  if (!req || typeof req !== "object") return null;
  const adminInfo = req.adminInfo;
  if (!adminInfo || typeof adminInfo !== "object" || !adminInfo.id || !adminInfo.role) {
    return null;
  }
  return {
    adminId: String(adminInfo.id),
    tokenRole: adminInfo.role,
  };
}

async function resolveAuthorizedAdminActor(authInfo, deps = {}) {
  const AdminModel = deps.Admin || Admin;
  if (!authInfo || typeof authInfo !== "object") {
    const error = new Error("Authentication required for admin operation.");
    error.statusCode = 401;
    error.code = "ADMIN_AUTHENTICATION_REQUIRED";
    throw error;
  }

  const { adminId, tokenRole } = authInfo;
  if (!adminId || !tokenRole) {
    const error = new Error("Admin identity reference missing from token payload.");
    error.statusCode = 401;
    error.code = "ADMIN_IDENTITY_MISSING";
    throw error;
  }

  const admin = await AdminModel.findById(adminId).lean();
  if (!admin) {
    const error = new Error("Authenticated admin record not found.");
    error.statusCode = 401;
    error.code = "ADMIN_NOT_FOUND";
    throw error;
  }

  if (admin.isActive !== true) {
    const error = new Error("Admin account is inactive.");
    error.statusCode = 403;
    error.code = "ADMIN_INACTIVE";
    throw error;
  }

  if (admin.accountLocked === true) {
    const error = new Error("Admin account is locked.");
    error.statusCode = 403;
    error.code = "ADMIN_LOCKED";
    throw error;
  }

  if (!ALLOWED_ADMIN_ROLES.includes(admin.role)) {
    const error = new Error(`Role '${admin.role}' is not authorized for bus-owner operations.`);
    error.statusCode = 403;
    error.code = "ADMIN_ROLE_UNAUTHORIZED";
    throw error;
  }

  if (tokenRole !== admin.role) {
    const error = new Error("Admin token role does not match active account role.");
    error.statusCode = 403;
    error.code = "ADMIN_ROLE_MISMATCH";
    throw error;
  }

  return admin;
}

module.exports = {
  getAdminActor,
  resolveAuthorizedAdminActor,
  ALLOWED_ADMIN_ROLES,
};
