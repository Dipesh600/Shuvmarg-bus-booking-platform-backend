"use strict";

const errors = require("./fleet-document.errors");

async function resolveBusOwnerActor(userInfo, repository) {
  if (!userInfo || !userInfo.id || !userInfo.role) {
    throw errors.forbidden("Authentication required.");
  }
  if (userInfo.role !== "busOwner" && userInfo.role !== "BUS_OWNER") {
    throw errors.forbidden("Role 'busOwner' is required.");
  }

  const busOwner = await repository.findBusOwnerForActor(userInfo.id);
  if (!busOwner) {
    throw errors.notFound("BusOwner profile not found.");
  }

  return {
    actorType: "BUS_OWNER",
    actorId: busOwner._id,
    userId: String(userInfo.id),
  };
}

async function resolveAdminActor(adminInfo, resolveAuthorizedAdminActor) {
  const authInfo = adminInfo && typeof adminInfo === "object"
    ? { adminId: adminInfo.id, tokenRole: adminInfo.role }
    : null;

  const admin = await resolveAuthorizedAdminActor(authInfo);
  return {
    actorType: "ADMIN",
    actorId: admin._id,
    adminRole: admin.role,
  };
}

module.exports = {
  resolveBusOwnerActor,
  resolveAdminActor,
};
