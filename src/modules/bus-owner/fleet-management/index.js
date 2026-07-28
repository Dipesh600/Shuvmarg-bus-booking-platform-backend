"use strict";

const fleetService = require("../../../../services/fleetService");
const {
  createFleetManagementController,
} = require("./fleet-management.controller");

module.exports = createFleetManagementController({ fleetService });
