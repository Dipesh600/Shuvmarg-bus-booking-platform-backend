/**
 * setup2FA.js — Generates the Google Authenticator secret for the Super Admin
 * and saves a scannable QR code PNG to your Desktop.
 *
 * Run: node scripts/setup2FA.js
 *
 * After running:
 *   1. A QR code image will open automatically on your screen
 *   2. Open Google Authenticator on your phone
 *   3. Tap "+" → "Scan a QR code"
 *   4. Scan the image on screen
 *   5. Done — you can now log in!
 */

require("dotenv").config();
const mongoose = require("mongoose");
const speakeasy = require("speakeasy");
const QRCode = require("qrcode");
const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");
const dbConnection = require("../db/db.js");
const SuperAdmin = require("../models/adminModel.js");

const setup2FA = async () => {
  try {
    await dbConnection();

    const adminId = process.env.SUPER_ADMIN_ID || "SUMA-ADM-001";
    const admin = await SuperAdmin.findOne({ adminId });

    if (!admin) {
      console.error(`❌ Admin "${adminId}" not found. Run seedSuperAdmin.js first.`);
      return process.exit(1);
    }

    let secret;

    if (admin.twoFactorSecret) {
      console.log("ℹ️  2FA secret already exists. Regenerating QR code from existing secret...\n");
      secret = { base32: admin.twoFactorSecret };
      // Rebuild the otpauth URL from existing data
      secret.otpauth_url = `otpauth://totp/Sumarg%20Admin%20(${encodeURIComponent(admin.email)})?secret=${admin.twoFactorSecret}&issuer=Sumarg%20Platform`;
    } else {
      // Generate a new TOTP secret
      secret = speakeasy.generateSecret({
        name: `Sumarg Admin (${admin.email})`,
        issuer: "Sumarg Platform",
        length: 20,
      });

      admin.twoFactorSecret = secret.base32;
      admin.twoFactorEnabled = true;
      admin.twoFactorType = "GOOGLE_AUTH";
      await admin.save();
      console.log("✅ Google Authenticator 2FA secret generated and saved.\n");
    }

    // ── Generate QR code PNG ──────────────────────────────────────────────────
    const qrPath = path.join(
      process.env.HOME || process.env.USERPROFILE || ".",
      "Desktop",
      "sumarg_admin_2fa_qr.png"
    );

    await QRCode.toFile(qrPath, secret.otpauth_url, {
      type: "png",
      width: 400,
      margin: 2,
      color: {
        dark: "#003D38",   // Sumarg dark green
        light: "#FFFFFF",
      },
    });

    console.log("=".repeat(62));
    console.log("  📲  SCAN THIS QR CODE WITH GOOGLE AUTHENTICATOR");
    console.log("=".repeat(62));
    console.log(`\n✅ QR code saved to your Desktop:\n   ${qrPath}\n`);
    console.log("🔑 Backup Secret (store safely):", secret.base32);
    console.log("\nSTEPS:");
    console.log("  1. Open Google Authenticator on your phone");
    console.log("  2. Tap '+' → 'Scan a QR code'");
    console.log("  3. Scan the QR image that just appeared on your Desktop");
    console.log("  4. The 6-digit code will appear — use it to log in\n");
    console.log("=".repeat(62));

    // Open the QR image automatically (macOS)
    try {
      execSync(`open "${qrPath}"`);
      console.log("\n🖼  QR code image opened automatically.");
    } catch {
      console.log(`\n⚠️  Could not open automatically. Please open:\n   ${qrPath}`);
    }

    process.exit(0);
  } catch (error) {
    console.error("❌ Failed to setup 2FA:", error);
    process.exit(1);
  } finally {
    mongoose.connection.close();
  }
};

setup2FA();
