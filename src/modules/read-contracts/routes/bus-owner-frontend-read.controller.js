"use strict";

const { createBusOwnerReadService } = require("../bus-owner/bus-owner-read.service");
const { createFleetReadService } = require("../fleet/fleet-read.service");
const { mapReadError } = require("../common/read-error.mapper");
const busOwnerKyc = require("../../bus-owner/kyc-submission");

function createBusOwnerFrontendReadController({
  busOwnerReadService = createBusOwnerReadService(),
  fleetReadService = createFleetReadService(),
  getKycStatusHandler = busOwnerKyc.getMyBusOwnerKycStatus,
  logger = console,
} = {}) {
  return {
    async getProfile(req, res) {
      try {
        const result = await busOwnerReadService.getOwnProfile(req);
        return res.status(200).json(result);
      } catch (error) {
        const { statusCode, payload } = mapReadError(error, logger);
        return res.status(statusCode).json(payload);
      }
    },

    async getKycStatus(req, res) {
      return getKycStatusHandler(req, res);
    },

    async getFleetList(req, res) {
      try {
        const result = await fleetReadService.listFleetsForOwner(req);
        return res.status(200).json(result);
      } catch (error) {
        const { statusCode, payload } = mapReadError(error, logger);
        return res.status(statusCode).json(payload);
      }
    },

    async getFleetDetail(req, res) {
      try {
        const result = await fleetReadService.getFleetDetailForOwner(req);
        return res.status(200).json(result);
      } catch (error) {
        const { statusCode, payload } = mapReadError(error, logger);
        return res.status(statusCode).json(payload);
      }
    },
  };
}

module.exports = { createBusOwnerFrontendReadController };
