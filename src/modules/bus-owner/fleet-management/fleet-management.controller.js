"use strict";

const { createBusOwnerFleetReadController } = require("./fleet-read.controller");
const { createBusOwnerFleetCommandController } = require("./fleet-command.controller");
const { createFleetReadService } = require("../../read-contracts/fleet/fleet-read.service");

const { createFleetSubmissionService } = require("../../fleet-management/fleet-submission.service");
const FleetRouteSetup = require("../../../../models/fleetRouteSetupModel");

const defaultReadService = createFleetReadService();
const defaultFleetReadController = createBusOwnerFleetReadController();
const defaultSubmissionService = createFleetSubmissionService({ FleetRouteSetup });

function createFleetManagementController({
  fleetService,
  readService = defaultReadService,
  submissionService = defaultSubmissionService,
  commandService,
  logger = console,
} = {}) {
  const readCtrl = (readService === defaultReadService && logger === console)
    ? defaultFleetReadController
    : createBusOwnerFleetReadController({ readService, logger });

  const cmdCtrl = createBusOwnerFleetCommandController({
    commandService,
    fleetService,
    submissionService,
    logger,
  });

  return {
    getMyFleets: readCtrl.getMyFleets,
    getFleetById: readCtrl.getFleetById,

    createFleet: cmdCtrl.createFleet,
    updateFleet: cmdCtrl.updateFleet,
    deleteFleet: cmdCtrl.deleteFleet,

    submitFleetForVerification: cmdCtrl.submitFleetForVerification,
  };
}

module.exports = {
  createFleetManagementController,
  createBusOwnerFleetReadController,
  createBusOwnerFleetCommandController,
  defaultFleetReadController,
};
