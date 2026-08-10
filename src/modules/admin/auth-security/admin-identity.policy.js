"use strict";

// SM-ADM-<NAME> is the current human-readable format. The numeric SUMA form
// remains valid so existing administrator identities do not require migration.
const ADMIN_ID_PATTERN = /^(?:SM-ADM-[A-Z0-9]{3,24}|SUMA-ADM-\d{3})$/;

function normalizeAdminId(value) {
  return String(value || "").trim().toUpperCase();
}

function isValidAdminId(value) {
  return ADMIN_ID_PATTERN.test(normalizeAdminId(value));
}

module.exports = { ADMIN_ID_PATTERN, isValidAdminId, normalizeAdminId };
