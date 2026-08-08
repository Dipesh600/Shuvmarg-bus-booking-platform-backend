"use strict";

const { createFleetReadService } = require("../../read-contracts/fleet/fleet-read.service");
const { mapReadError } = require("../../read-contracts/common/read-error.mapper");

const defaultReadService = createFleetReadService();

function createBusOwnerFleetReadController({
  readService = defaultReadService,
  logger = console,
} = {}) {
  return {
    async getMyFleets(req, res) {
      try {
        const result = await readService.listFleetsForOwner(req);
        return res.status(200).json(result);
      } catch (error) {
        const { statusCode, payload } = mapReadError(error, logger);
        return res.status(statusCode).json(payload);
      }
    },

    async getFleetById(req, res) {
      try {
        const result = await readService.getFleetDetailForOwner(req);
        return res.status(200).json(result);
      } catch (error) {
        const { statusCode, payload } = mapReadError(error, logger);
        return res.status(statusCode).json(payload);
      }
    },
  };
}

module.exports = {
  createBusOwnerFleetReadController,
};
