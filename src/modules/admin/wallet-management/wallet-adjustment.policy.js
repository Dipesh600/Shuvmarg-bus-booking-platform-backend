"use strict";
const { toMinorUnits } = require("../../../shared/money");

const PURPOSES = [
  "admin_adjustment", "bonus", "promotional", "reversal",
];

function validateAdjustment(data) {
  const { userId, type, amount, purpose, remarks } = data;
  if (!userId) return "userId is required";
  if (!type || !["credit", "debit"].includes(type)) {
    return "type must be 'credit' or 'debit'";
  }
  try { toMinorUnits(amount, { allowZero: false }); } catch {
    return "amount must be a positive number";
  }
  if (!purpose || !PURPOSES.includes(purpose)) {
    return `purpose must be one of: ${PURPOSES.join(", ")}`;
  }
  if (typeof remarks !== "string" || remarks.trim().length < 10 || remarks.length > 2000) {
    return "remarks is required and must be at least 10 characters. " +
      "This becomes a permanent audit record.";
  }
  return null;
}

function validateStatusChange(data) {
  const { userId, action, remarks } = data;
  if (!userId) return "userId is required";
  if (!action || !["freeze", "unfreeze"].includes(action)) {
    return "action must be 'freeze' or 'unfreeze'";
  }
  if (typeof remarks !== "string" || remarks.trim().length < 10 || remarks.length > 2000) {
    return "remarks is required (min 10 chars). Explain why this wallet is " +
      `being ${action}d.`;
  }
  return null;
}

module.exports = { validateAdjustment, validateStatusChange };
