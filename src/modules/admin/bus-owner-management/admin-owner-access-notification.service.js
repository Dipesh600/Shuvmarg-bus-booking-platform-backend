"use strict";

const {
  notifyNewOwnerCredentials,
  notifyExistingOwnerAccess,
} = require("./admin-owner-identity.service");

const FAILED = { status: "FAILED", channel: "SMS", canRetry: true };

async function dispatchOwnerAccessNotification(input, deps = {}) {
  const notifyNew = deps.notifyNewOwnerCredentials || notifyNewOwnerCredentials;
  const notifyExisting = deps.notifyExistingOwnerAccess || notifyExistingOwnerAccess;
  try {
    if (input.isNew) {
      return await notifyNew({
        userId: input.user._id,
        phone: input.body.phone,
        email: input.body.email,
        ownerName: input.body.ownerName,
        password: input.password,
        expiresAt: input.expiresAt,
      }, deps) || FAILED;
    }
    return await notifyExisting({
      userId: input.user._id,
      phone: input.body.phone,
      ownerName: input.body.ownerName,
    }, deps) || FAILED;
  } catch (error) {
    (deps.logger || console).warn(
      "Admin-created owner access notification failed:",
      error?.message || error
    );
    return FAILED;
  }
}

module.exports = { dispatchOwnerAccessNotification };
