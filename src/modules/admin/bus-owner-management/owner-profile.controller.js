"use strict";

const { getAdminActor } = require("./admin-actor.resolver");
const { mapAdminOwnerProfileError } = require("./admin-owner-profile-error.mapper");

function createOwnerProfileController({
  updateAdminOwnerProfile,
  console: logger = console,
}) {
  return {
    async updateBusOwnerProfile(req, res) {
      try {
        const input = {
          ...(req.body || {}),
          actor: getAdminActor(req),
        };
        const result = await updateAdminOwnerProfile(input);
        return res.status(200).json(result);
      } catch (error) {
        logger.error("Admin owner profile update failed:", error);
        const mapped = mapAdminOwnerProfileError(error);
        return res.status(mapped.statusCode).json(mapped.payload);
      }
    },
  };
}

module.exports = { createOwnerProfileController };
