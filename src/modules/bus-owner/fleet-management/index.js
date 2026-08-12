"use strict";

const fleetService = require("../../fleet-management");
const layoutRevisions = require("../../fleet-management/seat-layout-revision");
const {
  createFleetManagementController,
} = require("./fleet-management.controller");

module.exports = createFleetManagementController({ fleetService, layoutRevisions });
