"use strict";

const { createBusOwnerFleetCommandService } = require("./fleet-command.service");
const { mapFleetCommandError } = require("./fleet-command-error.mapper");

function createBusOwnerFleetCommandController({
  commandService,
  fleetService,
  logger = console,
} = {}) {
  const activeService = commandService || (
    fleetService ? createBusOwnerFleetCommandService({ fleetService }) : null
  );

  return {
    async createFleet(req, res) {
      try {
        const result = await activeService.createFleetForOwner(req);
        return res.status(201).json(result);
      } catch (error) {
        const { statusCode, payload } = mapFleetCommandError(error, logger);
        return res.status(statusCode).json(payload);
      }
    },

    async updateFleet(req, res) {
      try {
        const result = await activeService.updateFleetForOwner(req);
        return res.status(200).json(result);
      } catch (error) {
        const { statusCode, payload } = mapFleetCommandError(error, logger);
        return res.status(statusCode).json(payload);
      }
    },

    async deleteFleet(req, res) {
      try {
        const result = await activeService.deleteFleetForOwner(req);
        return res.status(200).json(result);
      } catch (error) {
        const { statusCode, payload } = mapFleetCommandError(error, logger);
        return res.status(statusCode).json(payload);
      }
    },
  };
}

module.exports = { createBusOwnerFleetCommandController };
