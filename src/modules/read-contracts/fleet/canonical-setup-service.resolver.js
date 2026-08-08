"use strict";

function createDefaultCanonicalSetupService() {
  const Bus = require("../../../../models/fleetModel");
  const Schedule = require("../../../../models/scheduleModel");
  const DriverProfile = require("../../../../models/driverProfileModel");
  const OperatorRouteConfig = require("../../../../models/operatorRouteConfigModel");
  const RouteVariant = require("../../../../models/routeVariantModel");
  const { createFleetSetupRepository } = require("../../admin/fleet-management/fleet-setup.repository");
  const { createFleetSetupService } = require("../../admin/fleet-management/fleet-setup.service");

  const setupRepository = createFleetSetupRepository({
    Bus,
    RouteVariant,
    OperatorRouteConfig,
    DriverProfile,
    Schedule,
  });

  return createFleetSetupService({ repository: setupRepository });
}

module.exports = {
  createDefaultCanonicalSetupService,
};
