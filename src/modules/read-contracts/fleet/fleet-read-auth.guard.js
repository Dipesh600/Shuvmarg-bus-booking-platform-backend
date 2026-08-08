"use strict";

const { getAdminActor, resolveAuthorizedAdminActor } = require("../../admin/bus-owner-management/admin-actor.resolver");
const { ReadContractUnauthorizedError, ReadContractForbiddenError } = require("../common/read-errors");

async function authorizeAdmin(req, resolveAdminActor = resolveAuthorizedAdminActor) {
  const actor = getAdminActor(req);
  if (!actor) {
    throw new ReadContractUnauthorizedError("UNAUTHORIZED_ADMIN", "Admin authentication required.");
  }
  const resolved = await resolveAdminActor(actor);
  if (!resolved) {
    throw new ReadContractUnauthorizedError("UNAUTHORIZED_ADMIN", "Admin authentication required.");
  }
  if (resolved.status === "inactive" || resolved.isLocked) {
    throw new ReadContractForbiddenError("READ_FORBIDDEN", "Admin account is inactive or locked.");
  }
  return resolved;
}

function authorizeOwner(req) {
  const userId = req.userInfo?.id;
  if (!userId || typeof userId !== "string") {
    throw new ReadContractUnauthorizedError("UNAUTHORIZED_OWNER", "Bus owner authentication required.");
  }
  return userId;
}

module.exports = {
  authorizeAdmin,
  authorizeOwner,
};
