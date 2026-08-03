/**
 * Initial Super-Admin Bootstrap
 *
 * Creates the first root super-admin account during initial environment setup.
 *
 * This script:
 * - may run only when no super-admin account exists;
 * - must never create additional administrators;
 * - must not run automatically during application startup;
 * - must not be used after dashboard-based administrator management is available.
 *
 * Additional super admins must be created and managed through the admin dashboard.
 */

require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const dbConnection = require("../db/db.js");
const SuperAdmin = require("../models/adminModel.js");

function validatePassword(password) {
  if (!password || password.length < 12) {
    return "Password must be at least 12 characters long.";
  }
  if (!/[A-Z]/.test(password)) {
    return "Password must contain at least one uppercase letter.";
  }
  if (!/[a-z]/.test(password)) {
    return "Password must contain at least one lowercase letter.";
  }
  if (!/[0-9]/.test(password)) {
    return "Password must contain at least one number.";
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return "Password must contain at least one special character.";
  }
  return null;
}

const bootstrapInitialSuperAdmin = async () => {
  let dbConnected = false;

  try {
    const requiredVariables = [
      "SUPER_ADMIN_EMAIL",
      "SUPER_ADMIN_ID",
      "SUPER_ADMIN_PASSWORD",
    ];

    const missingVariables = requiredVariables.filter(
      (name) => !process.env[name] || !process.env[name].trim()
    );

    if (missingVariables.length > 0) {
      console.error(
        `Config Error: Missing required environment variables: ${missingVariables.join(", ")}`
      );
      process.exitCode = 1;
      return;
    }

    const email = process.env.SUPER_ADMIN_EMAIL.trim();
    const adminId = process.env.SUPER_ADMIN_ID.trim();
    const plainPassword = process.env.SUPER_ADMIN_PASSWORD;

    const passwordError = validatePassword(plainPassword);
    if (passwordError) {
      console.error(`Security Error: Insecure SUPER_ADMIN_PASSWORD. ${passwordError}`);
      process.exitCode = 1;
      return;
    }

    await dbConnection();
    dbConnected = true;

    const existingSuperAdminCount = await SuperAdmin.countDocuments();
    if (existingSuperAdminCount > 0) {
      console.error(
        "Initial Super Admin already exists. Manage additional administrators through the dashboard."
      );
      process.exitCode = 1;
      return;
    }

    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    await SuperAdmin.create({
      adminId,
      email,
      password: hashedPassword,
    });

    console.log("Initial Super Admin account created successfully.");

  } catch (error) {
    console.error("Failed to bootstrap Initial Super Admin:", error.message);
    process.exitCode = 1;
  } finally {
    if (dbConnected) {
      await mongoose.connection.close();
    }
  }
};

module.exports = { bootstrapInitialSuperAdmin };

if (require.main === module) {
  bootstrapInitialSuperAdmin();
}
