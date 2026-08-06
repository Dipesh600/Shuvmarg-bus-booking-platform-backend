"use strict";

const { createBusOwnerFleetReadController } = require("./fleet-read.controller");
const { createBusOwnerFleetCommandController } = require("./fleet-command.controller");
const { createFleetReadService } = require("../../read-contracts/fleet/fleet-read.service");

const defaultReadService = createFleetReadService();
const defaultFleetReadController = createBusOwnerFleetReadController();

function createFleetManagementController({
  fleetService,
  readService = defaultReadService,
  commandService,
  logger = console,
} = {}) {
  const readCtrl = (readService === defaultReadService && logger === console)
    ? defaultFleetReadController
    : createBusOwnerFleetReadController({ readService, logger });

  const cmdCtrl = createBusOwnerFleetCommandController({
    commandService,
    fleetService,
    logger,
  });

  return {
    getMyFleets: readCtrl.getMyFleets,
    getFleetById: readCtrl.getFleetById,

    createFleet: cmdCtrl.createFleet,
    updateFleet: cmdCtrl.updateFleet,
    deleteFleet: cmdCtrl.deleteFleet,

    submitFleetForVerification: cmdCtrl.createFleet,
  };
}

module.exports = {
  createFleetManagementController,
  createBusOwnerFleetReadController,
  createBusOwnerFleetCommandController,
  defaultFleetReadController,
};
