"use strict";

const { createBusOwnerFleetReadController } = require("./fleet-read.controller");
const { createBusOwnerFleetCommandController } = require("./fleet-command.controller");
const { createFleetReadService } = require("../../read-contracts/fleet/fleet-read.service");

const { createFleetSubmissionService } = require("../../fleet-management/fleet-submission.service");

const defaultReadService = createFleetReadService();
const defaultFleetReadController = createBusOwnerFleetReadController();
const defaultSubmissionService = createFleetSubmissionService();

function createFleetManagementController({
  fleetService,
  readService = defaultReadService,
  submissionService = defaultSubmissionService,
  commandService,
  layoutRevisions,
  logger = console,
} = {}) {
  const readCtrl = (readService === defaultReadService && logger === console)
    ? defaultFleetReadController
    : createBusOwnerFleetReadController({ readService, logger });

  const cmdCtrl = createBusOwnerFleetCommandController({
    commandService,
    fleetService,
    submissionService,
    layoutRevisions,
    logger,
  });

  return {
    getMyFleets: readCtrl.getMyFleets,
    getFleetById: readCtrl.getFleetById,

    createFleet: cmdCtrl.createFleet,
    updateFleet: cmdCtrl.updateFleet,
    deleteFleet: cmdCtrl.deleteFleet,

    submitFleetForVerification: cmdCtrl.submitFleetForVerification,
    requestSeatLayoutRevision: cmdCtrl.requestSeatLayoutRevision,
    listSeatLayoutRevisions: cmdCtrl.listSeatLayoutRevisions,
  };
}

module.exports = {
  createFleetManagementController,
  createBusOwnerFleetReadController,
  createBusOwnerFleetCommandController,
  defaultFleetReadController,
};
