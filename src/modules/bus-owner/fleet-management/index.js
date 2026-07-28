"use strict";

const fleetService = require("../../fleet-management");
const {
  createFleetManagementController,
} = require("./fleet-management.controller");

module.exports = createFleetManagementController({ fleetService });
