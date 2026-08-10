"use strict";

require("dotenv").config();
const mongoose = require("mongoose");
const dbConnection = require("../db/db");
const SuperAdmin = require("../models/adminModel");
const BootstrapState = require("../models/adminBootstrapStateModel");
const { generateOneTimeToken, hashToken } = require("../src/modules/admin/auth-security/admin-auth.crypto");

async function renewEnrollment() {
  const environment = String(process.env.ADMIN_BOOTSTRAP_ENVIRONMENT || "").trim();
  const adminId = String(process.env.SUPER_ADMIN_ID || "").trim().toUpperCase();
  if (!environment || !adminId ||
    process.env.ADMIN_BOOTSTRAP_CONFIRM !== `REISSUE_ROOT_ENROLLMENT:${environment}`) {
    throw new Error("Explicit root enrollment reissue confirmation is required");
  }
  const state = await BootstrapState.findOne({ key: "INITIAL_ROOT_ADMIN", environment })
    .select("+enrollmentTokenHash");
  const root = state && await SuperAdmin.findById(state.rootAdminId);
  if (!state || state.status !== "PROVISIONING" || !root || !root.isRootAdmin ||
    root.adminId !== adminId || root.lifecycleStatus !== "MFA_PENDING" || root.isActive) {
    throw new Error("Root enrollment is not eligible for token reissue");
  }
  const token = generateOneTimeToken();
  state.enrollmentTokenHash = hashToken(token);
  state.enrollmentExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
  await state.save();
  return token;
}

async function run() {
  try {
    await dbConnection();
    const token = await renewEnrollment();
    console.log(`Replacement enrollment token (expires in 30 minutes): ${token}`);
    console.log("No administrator was created or modified.");
  } catch (error) {
    console.error(`Enrollment token reissue refused: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
}

module.exports = { renewEnrollment };
if (require.main === module) run();
