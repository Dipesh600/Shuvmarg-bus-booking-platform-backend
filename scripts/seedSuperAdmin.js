/**
 * scripts/seedSuperAdmin.js
 *
 * Super-Admin Bootstrap Seeder
 *
 * PURPOSE:
 *   Creates the initial platform Super Admin account for local, staging, or production
 *   bootstrap scenarios.
 *
 * USAGE:
 *   SUPER_ADMIN_EMAIL="admin@example.com" \
 *   SUPER_ADMIN_ID="YOUR_SUPER_ADMIN_ID" \
 *   SUPER_ADMIN_PASSWORD="StrongSecurePassword#2026!" \
 *   node scripts/seedSuperAdmin.js
 *
 * SECURITY REQUIREMENTS:
 *   - All three environment variables (SUPER_ADMIN_EMAIL, SUPER_ADMIN_ID, SUPER_ADMIN_PASSWORD) are required.
 *   - No fallback values or hardcoded credentials are permitted.
 *   - Password must be at least 12 characters and contain uppercase, lowercase, digit, and special characters.
 *   - Never prints passwords, tokens, or raw connection strings to stdout/stderr.
 *   - Fails BEFORE establishing a database connection if configuration is invalid.
 *   - Safe and idempotent to run multiple times.
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

const seedSuperAdmin = async () => {
    // 1. Validate environment variables before connecting to DB
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
            `❌ Config Error: Missing required environment variables: ${missingVariables.join(", ")}`
        );
        process.exit(1);
    }

    const email = process.env.SUPER_ADMIN_EMAIL.trim();
    const adminId = process.env.SUPER_ADMIN_ID.trim();
    const plainPassword = process.env.SUPER_ADMIN_PASSWORD;

    const passwordError = validatePassword(plainPassword);
    if (passwordError) {
        console.error(`❌ Security Error: Insecure SUPER_ADMIN_PASSWORD. ${passwordError}`);
        process.exit(1);
    }

    let dbConnected = false;

    try {
        await dbConnection();
        dbConnected = true;

        const existing = await SuperAdmin.findOne({
            $or: [{ email }, { adminId }],
        });

        if (existing) {
            console.log("ℹ️ Super Admin account already exists (email or adminId matched). Skipping creation.");
            process.exit(0);
        }

        const hashedPassword = await bcrypt.hash(plainPassword, 10);

        await SuperAdmin.create({
            adminId,
            email,
            password: hashedPassword,
        });

        console.log("✅ Super Admin account created successfully!");
        console.log(`   Admin ID: ${adminId}`);
        console.log(`   Email: ${email}`);

        process.exit(0);
    } catch (error) {
        console.error("❌ Failed to seed Super Admin:", error.message);
        process.exit(1);
    } finally {
        if (dbConnected && mongoose.connection.readyState !== 0) {
            await mongoose.connection.close();
        }
    }
};

seedSuperAdmin();
