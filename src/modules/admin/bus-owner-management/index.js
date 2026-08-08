"use strict";

const BusOwner = require("../../../../models/busOwnerModel");
const User = require("../../../../models/userModel");
const { createAdminOwnerProfileRepository } = require("./admin-owner-profile.repository");
const { createAdminOwnerProfileService } = require("./admin-owner-profile.service");
const { createOwnerProfileController } = require("./owner-profile.controller");

const profileRepository = createAdminOwnerProfileRepository({ BusOwner, User });
const profileService = createAdminOwnerProfileService({ repository: profileRepository });
const profileController = createOwnerProfileController({
  updateAdminOwnerProfile: profileService.updateAdminOwnerProfile,
});

module.exports = {
  ...require("./owner-query.controller.js"),
  ...require("./owner-creation.controller.js"),
  updateBusOwnerProfile: profileController.updateBusOwnerProfile,
  ...require("./owner-dashboard.controller.js"),
  ...require("./kyc-query.controller.js"),
  ...require("./kyc-review.controller.js"),
  ...require("./kyc-document.controller.js"),
};
