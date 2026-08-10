"use strict";

require("dotenv").config();
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const dbConnection = require("../db/db");
const SuperAdmin = require("../models/adminModel");
const BootstrapState = require("../models/adminBootstrapStateModel");
const { assertStrongPassword } = require("../src/modules/admin/auth-security/admin-password.policy");
const { generateOneTimeToken, hashToken } = require("../src/modules/admin/auth-security/admin-auth.crypto");
const { recordSecurityEvent } = require("../src/modules/admin/auth-security/admin-security-audit.service");

const BOOTSTRAP_KEY = "INITIAL_ROOT_ADMIN";

function requiredConfig() {
  const names = [
    "SUPER_ADMIN_EMAIL", "SUPER_ADMIN_ID", "SUPER_ADMIN_PASSWORD",
    "ADMIN_BOOTSTRAP_ENVIRONMENT", "ADMIN_BOOTSTRAP_CONFIRM",
  ];
  const missing = names.filter((name) => !String(process.env[name] || "").trim());
  if (missing.length) throw new Error(`Missing required variables: ${missing.join(", ")}`);
  const environment = process.env.ADMIN_BOOTSTRAP_ENVIRONMENT.trim();
  if (process.env.ADMIN_BOOTSTRAP_CONFIRM !== `CREATE_INITIAL_ROOT:${environment}`) {
    throw new Error("ADMIN_BOOTSTRAP_CONFIRM does not match the target environment");
  }
  assertStrongPassword(process.env.SUPER_ADMIN_PASSWORD);
  return {
    environment,
    email: process.env.SUPER_ADMIN_EMAIL.trim().toLowerCase(),
    adminId: process.env.SUPER_ADMIN_ID.trim().toUpperCase(),
    password: process.env.SUPER_ADMIN_PASSWORD,
  };
}

async function createRootAtomically(config) {
  const rawToken = generateOneTimeToken();
  const password = await bcrypt.hash(config.password, 12);
  const session = await mongoose.startSession();
  let root;
  try {
    await session.withTransaction(async () => {
      if (await BootstrapState.exists({ key: BOOTSTRAP_KEY }).session(session)) {
        const error = new Error("Initial root bootstrap has already been consumed");
        error.code = "ROOT_BOOTSTRAP_ALREADY_CONSUMED";
        throw error;
      }
      if (await SuperAdmin.exists({}).session(session)) {
        const error = new Error("Admin data already exists; bootstrap refused");
        error.code = "ADMIN_DATA_ALREADY_EXISTS";
        throw error;
      }
      [root] = await SuperAdmin.create([{
        adminId: config.adminId, email: config.email, password,
        role: "SUPER_ADMIN", isRootAdmin: true, lifecycleStatus: "MFA_PENDING",
        twoFactorEnabled: false, isActive: false,
      }], { session });
      await BootstrapState.create([{
        key: BOOTSTRAP_KEY, environment: config.environment, status: "PROVISIONING",
        rootAdminId: root._id, enrollmentTokenHash: hashToken(rawToken),
        enrollmentExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
      }], { session });
    });
  } finally {
    await session.endSession();
  }
  return { root, rawToken };
}

async function bootstrapInitialSuperAdmin() {
  let connected = false;
  try {
    const config = requiredConfig();
    await dbConnection();
    connected = true;
    const result = await createRootAtomically(config);
    await recordSecurityEvent("ROOT_BOOTSTRAPPED", {
      targetAdminId: result.root._id, metadata: { environment: config.environment },
    });
    console.log("Initial root admin created in MFA_PENDING state.");
    console.log(`One-time enrollment token (expires in 30 minutes): ${result.rawToken}`);
    console.log("This command can never create another root in this database.");
    return result;
  } catch (error) {
    console.error(`Root bootstrap refused: ${error.message}`);
    process.exitCode = 1;
    return null;
  } finally {
    if (connected) await mongoose.connection.close();
  }
}

module.exports = { BOOTSTRAP_KEY, bootstrapInitialSuperAdmin, createRootAtomically, requiredConfig };

if (require.main === module) bootstrapInitialSuperAdmin();
