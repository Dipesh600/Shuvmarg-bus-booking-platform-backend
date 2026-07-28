"use strict";

const amenityService = require("../../../../services/amenityService");
const {
  createAmenityManagementController,
} = require("./amenity-management.controller");

module.exports = createAmenityManagementController({ amenityService });
