"use strict";

const ALLOWED_BODY_FIELDS = Object.freeze([
  "companyName",
  "ownerName",
  "phone",
  "email",
  "address",
  "bankName",
  "accountHolderName",
  "accountNumber",
  "branchName",
  "swiftCode",
  "panNumber",
  "registrationNumber",
]);

const REQUIRED_BODY_FIELDS = Object.freeze([
  "companyName",
  "ownerName",
  "phone",
  "address",
  "bankName",
  "accountHolderName",
  "accountNumber",
  "branchName",
]);

function createBodyValidationError(message, field = null, code = "ADMIN_CREATION_INVALID_BODY") {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = code;
  if (field) error.field = field;
  return error;
}

function normalizePhone(phone) {
  if (typeof phone !== "string") return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10 && (digits.startsWith("98") || digits.startsWith("97") || digits.startsWith("96"))) {
    return digits;
  }
  if (digits.length === 13 && digits.startsWith("977")) {
    return digits.slice(3);
  }
  return digits.length >= 7 && digits.length <= 15 ? digits : null;
}

function validateAdminOwnerCreationBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw createBodyValidationError("Missing required fields for Company or Bank details.");
  }

  const keys = Object.keys(body);
  for (const key of keys) {
    if (!ALLOWED_BODY_FIELDS.includes(key)) {
      throw createBodyValidationError(`Unexpected or forbidden request body field '${key}'.`, key, "ADMIN_CREATION_UNKNOWN_FIELD");
    }
    const val = body[key];
    if (val !== undefined && val !== null && typeof val !== "string") {
      throw createBodyValidationError(`Field '${key}' must be a text string.`, key);
    }
  }

  const sanitized = {};
  for (const field of REQUIRED_BODY_FIELDS) {
    const raw = body[field];
    if (!raw || typeof raw !== "string" || raw.trim().length === 0) {
      throw createBodyValidationError("Missing required fields for Company or Bank details.", field, "ADMIN_CREATION_REQUIRED_FIELD_MISSING");
    }
    sanitized[field] = raw.trim();
  }

  for (const field of ALLOWED_BODY_FIELDS) {
    if (REQUIRED_BODY_FIELDS.includes(field)) continue;
    const raw = body[field];
    if (raw && typeof raw === "string" && raw.trim().length > 0) {
      sanitized[field] = raw.trim();
    } else {
      sanitized[field] = null;
    }
  }

  const normalizedPhone = normalizePhone(sanitized.phone);
  if (!normalizedPhone) {
    throw createBodyValidationError("Invalid phone number format for bus owner.", "phone", "ADMIN_CREATION_INVALID_PHONE");
  }
  sanitized.phone = normalizedPhone;

  if (sanitized.email) {
    const lowerEmail = sanitized.email.toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(lowerEmail)) {
      throw createBodyValidationError("Invalid email address format.", "email", "ADMIN_CREATION_INVALID_EMAIL");
    }
    sanitized.email = lowerEmail;
  }

  return sanitized;
}

module.exports = {
  ALLOWED_BODY_FIELDS,
  REQUIRED_BODY_FIELDS,
  validateAdminOwnerCreationBody,
  normalizePhone,
};
