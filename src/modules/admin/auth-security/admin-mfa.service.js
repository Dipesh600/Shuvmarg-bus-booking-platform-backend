"use strict";

const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const QRCode = require("qrcode");
const speakeasy = require("speakeasy");
const { decryptSecret, encryptSecret } = require("./admin-auth.crypto");

async function createEnrollment(email) {
  const secret = speakeasy.generateSecret({
    name: `Shuvmarg Admin (${email})`, issuer: "Shuvmarg", length: 32,
  });
  return {
    encryptedSecret: encryptSecret(secret.base32),
    manualEntryKey: secret.base32,
    otpauthUrl: secret.otpauth_url,
    qrCodeDataUrl: await QRCode.toDataURL(secret.otpauth_url, {
      errorCorrectionLevel: "M", margin: 1, width: 280,
    }),
  };
}

function secretForAdmin(admin, pending = false) {
  const encrypted = pending
    ? admin.pendingEncryptedTwoFactorSecret
    : admin.encryptedTwoFactorSecret;
  if (encrypted) return decryptSecret(encrypted);
  if (!pending && admin.twoFactorSecret) return admin.twoFactorSecret;
  return null;
}

function matchedCounter(secret, token, now = Date.now()) {
  const result = speakeasy.totp.verifyDelta({
    secret, encoding: "base32", token: String(token), window: 1, time: now / 1000,
  });
  if (!result) return null;
  return Math.floor(now / 1000 / 30) + result.delta;
}

async function recoveryCodes() {
  const raw = Array.from({ length: 8 }, () => crypto.randomBytes(8).toString("hex"));
  const hashes = await Promise.all(raw.map((code) => bcrypt.hash(code, 12)));
  return { raw, hashes };
}

async function consumeRecoveryCode(admin, supplied) {
  for (let index = 0; index < admin.recoveryCodeHashes.length; index += 1) {
    if (await bcrypt.compare(supplied, admin.recoveryCodeHashes[index])) {
      admin.recoveryCodeHashes.splice(index, 1);
      return true;
    }
  }
  return false;
}

module.exports = {
  consumeRecoveryCode, createEnrollment, matchedCounter, recoveryCodes, secretForAdmin,
};
