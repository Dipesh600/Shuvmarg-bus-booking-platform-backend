"use strict";

const { mapFleetCommandError } = require("./fleet-command-error.mapper");
const { createBusOwnerFleetCommandService } = require("./fleet-command.service");

function createBusOwnerFleetCommandController({ commandService, fleetService, submissionService, logger = console }) {
  const service = commandService || createBusOwnerFleetCommandService({ fleetService, submissionService });

  async function createFleet(req, res) {
    try {
      const result = await service.createFleetForOwner(req);
      return res.status(201).json(result);
    } catch (error) {
      const { statusCode, payload } = mapFleetCommandError(error, { operation: "create", logger });
      return res.status(statusCode).json(payload);
    }
  }

  async function updateFleet(req, res) {
    try {
      const result = await service.updateFleetForOwner(req);
      return res.status(200).json(result);
    } catch (error) {
      const { statusCode, payload } = mapFleetCommandError(error, { operation: "update", logger });
      return res.status(statusCode).json(payload);
    }
  }

  async function deleteFleet(req, res) {
    try {
      const result = await service.deleteFleetForOwner(req);
      return res.status(200).json(result);
    } catch (error) {
      const { statusCode, payload } = mapFleetCommandError(error, { operation: "delete", logger });
      return res.status(statusCode).json(payload);
    }
  }

  async function submitFleetForVerification(req, res) {
    try {
      const result = await service.submitFleetForOwner(req);
      return res.status(200).json(result);
    } catch (error) {
      const { statusCode, payload } = mapFleetCommandError(error, { operation: "create", logger });
      return res.status(statusCode).json(payload);
    }
  }

  return {
    createFleet,
    updateFleet,
    deleteFleet,
    submitFleetForVerification,
  };
}

module.exports = { createBusOwnerFleetCommandController };
