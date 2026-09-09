"use strict";

const RETRY_DELAYS_MS = Object.freeze([0, 60_000, 300_000, 900_000, 3_600_000]);
const NEPAL_MOBILE = /^(97|98)\d{8}$/;

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  const local = digits.startsWith("977") && digits.length > 10 ? digits.slice(3) : digits;
  const normalized = local.startsWith("0") && local.length === 11 ? local.slice(1) : local;
  if (!NEPAL_MOBILE.test(normalized)) throw Object.assign(new Error("A valid Nepal mobile number is required"), {
    code: "INVALID_SMS_RECIPIENT", retryable: false,
  });
  return normalized;
}

function maskPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length < 4) return "**********";
  return `${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

function sanitizeErrorMessage(value) {
  return String(value || "SMS delivery failed")
    .replace(/\b(?:\+?977)?(?:97|98)\d{8}\b/g, "**********")
    .replace(/token[=: ]+[^\s,}]+/gi, "token=[REDACTED]")
    .slice(0, 300);
}

function classifyDeliveryError(error) {
  if (typeof error?.retryable === "boolean") return {
    retryable: error.retryable,
    category: error.category || "PROVIDER_ERROR",
    code: String(error.providerCode || error.code || "SMS_PROVIDER_ERROR"),
  };
  const status = Number(error?.response?.status || error?.statusCode);
  const code = String(error?.code || "SMS_PROVIDER_ERROR");
  const retryable = [408, 425, 429].includes(status) || status >= 500
    || ["ECONNRESET", "ECONNABORTED", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN"].includes(code);
  return { retryable, category: retryable ? "TEMPORARY" : "PERMANENT", code };
}

function nextRetryAt(attempts, now = new Date()) {
  const base = RETRY_DELAYS_MS[Math.min(Math.max(attempts, 1), RETRY_DELAYS_MS.length - 1)];
  const jitter = Math.floor(base * 0.1 * Math.random());
  return new Date(now.getTime() + base + jitter);
}

module.exports = {
  RETRY_DELAYS_MS,
  classifyDeliveryError,
  maskPhone,
  nextRetryAt,
  normalizePhone,
  sanitizeErrorMessage,
};
