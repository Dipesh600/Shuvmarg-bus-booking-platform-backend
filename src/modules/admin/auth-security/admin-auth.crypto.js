"use strict";

const crypto = require("crypto");

const TOKEN_BYTES = 32;

function hashToken(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function generateOneTimeToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString("base64url");
}

function encryptionKey() {
  const encoded = process.env.ADMIN_MFA_ENCRYPTION_KEY;
  if (!encoded) throw new Error("ADMIN_MFA_ENCRYPTION_KEY is required");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new Error("ADMIN_MFA_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  }
  return key;
}

function encryptSecret(secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url")].join(":");
}

function decryptSecret(payload) {
  const [version, iv, tag, ciphertext] = String(payload || "").split(":");
  if (version !== "v1" || !iv || !tag || !ciphertext) {
    throw new Error("Invalid encrypted MFA secret");
  }
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final(),
  ]).toString("utf8");
}

module.exports = { decryptSecret, encryptSecret, generateOneTimeToken, hashToken };
