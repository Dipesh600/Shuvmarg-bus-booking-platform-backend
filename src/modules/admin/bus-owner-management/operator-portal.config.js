"use strict";

function resolveOperatorLoginUrl(env = process.env) {
  const configured = String(env.OPERATOR_APP_URL || "").trim().replace(/\/+$/, "");
  const baseUrl = configured || (env.NODE_ENV === "production" ? "" : "http://localhost:3000");
  if (!baseUrl) {
    const error = new Error("OPERATOR_APP_URL is required for operator access notifications.");
    error.code = "OPERATOR_APP_URL_MISSING";
    throw error;
  }
  let parsed;
  try { parsed = new URL(baseUrl); } catch {
    const error = new Error("OPERATOR_APP_URL must be a valid absolute URL.");
    error.code = "OPERATOR_APP_URL_INVALID";
    throw error;
  }
  if (env.NODE_ENV === "production" && parsed.protocol !== "https:") {
    const error = new Error("OPERATOR_APP_URL must use HTTPS outside local development.");
    error.code = "OPERATOR_APP_URL_INSECURE";
    throw error;
  }
  return `${baseUrl}/login`;
}

function temporaryCredentialTtlMs(env = process.env) {
  const hours = Number(env.TEMPORARY_CREDENTIAL_TTL_HOURS || 24);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 72) return 24 * 60 * 60 * 1000;
  return hours * 60 * 60 * 1000;
}

module.exports = { resolveOperatorLoginUrl, temporaryCredentialTtlMs };
