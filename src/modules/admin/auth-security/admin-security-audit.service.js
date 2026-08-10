"use strict";

const AdminSecurityEvent = require("../../../../models/adminSecurityEventModel");

async function recordSecurityEvent(action, input = {}) {
  try {
    await AdminSecurityEvent.create({
      action,
      actorAdminId: input.actorAdminId || null,
      targetAdminId: input.targetAdminId || null,
      outcome: input.outcome || "SUCCESS",
      ipAddress: input.ipAddress || null,
      userAgent: input.userAgent || null,
      metadata: input.metadata || {},
    });
  } catch (error) {
    console.error("Admin security audit write failed", { action, error: error.message });
  }
}

module.exports = { recordSecurityEvent };
