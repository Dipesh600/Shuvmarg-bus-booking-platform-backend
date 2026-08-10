"use strict";

const SuperAdmin = require("../../../../models/adminModel");
const { authError } = require("./admin-auth.errors");
const { recordSecurityEvent } = require("./admin-security-audit.service");

async function setAdministratorStatus(targetId, status, rootAdminId, requestContext = {}) {
  if (!new Set(["ACTIVE", "SUSPENDED"]).has(status)) {
    throw authError("INVALID_ADMIN_STATUS", "Status must be ACTIVE or SUSPENDED", 400);
  }
  const target = await SuperAdmin.findById(targetId);
  if (!target) throw authError("ADMIN_NOT_FOUND", "Administrator not found", 404);
  if (target.isRootAdmin || String(target._id) === String(rootAdminId)) {
    throw authError("ROOT_ADMIN_IMMUTABLE", "The root administrator cannot be suspended", 409);
  }
  if (!target.twoFactorEnabled && status === "ACTIVE") {
    throw authError("ADMIN_MFA_REQUIRED", "Administrator must complete MFA enrollment", 409);
  }
  target.lifecycleStatus = status;
  target.isActive = status === "ACTIVE";
  target.sessionVersion = (target.sessionVersion || 0) + 1;
  await target.save();
  await recordSecurityEvent(status === "ACTIVE" ? "ADMIN_REACTIVATED" : "ADMIN_SUSPENDED", {
    actorAdminId: rootAdminId, targetAdminId: target._id, ...requestContext,
  });
  return target;
}

module.exports = { setAdministratorStatus };
