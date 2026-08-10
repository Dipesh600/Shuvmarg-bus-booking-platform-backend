"use strict";

const jwt = require("jsonwebtoken");
const SuperAdmin = require("../../models/adminModel");

async function createAdminToken({ adminId, email, password, role = "SUPER_ADMIN" }) {
  const admin = await SuperAdmin.create({
    adminId, email, password, role, lifecycleStatus: "ACTIVE",
    isActive: true, twoFactorEnabled: true, sessionVersion: 1,
  });
  return jwt.sign({
    id: admin._id, adminId: admin.adminId, email: admin.email, role,
    purpose: "access", sessionVersion: admin.sessionVersion,
  }, process.env.SECRET_KEY, {
    algorithm: "HS256", expiresIn: "30m", issuer: "shuvmarg-admin",
    audience: "shuvmarg-super-admin",
  });
}

module.exports = { createAdminToken };
