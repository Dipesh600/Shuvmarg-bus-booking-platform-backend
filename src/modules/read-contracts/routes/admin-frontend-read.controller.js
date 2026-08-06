"use strict";

const { createAdminBusOwnerReadService } = require("../admin-bus-owner/admin-bus-owner-read.service");
const { createAdminKycReadService } = require("../admin-kyc/admin-kyc-read.service");
const { createFleetReadService } = require("../fleet/fleet-read.service");
const { mapReadError } = require("../common/read-error.mapper");

function createAdminFrontendReadController({
  adminBusOwnerReadService = createAdminBusOwnerReadService(),
  adminKycReadService = createAdminKycReadService(),
  fleetReadService = createFleetReadService(),
  logger = console,
} = {}) {
  return {
    async getBusOwnerList(req, res) {
      try {
        const result = await adminBusOwnerReadService.listBusOwners(req);
        return res.status(200).json(result);
      } catch (error) {
        const { statusCode, payload } = mapReadError(error, logger);
        return res.status(statusCode).json(payload);
      }
    },

    async getBusOwnerDetail(req, res) {
      try {
        const result = await adminBusOwnerReadService.getBusOwnerDetail(req);
        return res.status(200).json(result);
      } catch (error) {
        const { statusCode, payload } = mapReadError(error, logger);
        return res.status(statusCode).json(payload);
      }
    },

    async getKycList(req, res) {
      try {
        const result = await adminKycReadService.listKycQueue(req);
        return res.status(200).json(result);
      } catch (error) {
        const { statusCode, payload } = mapReadError(error, logger);
        return res.status(statusCode).json(payload);
      }
    },

    async getKycDetail(req, res) {
      try {
        const result = await adminKycReadService.getKycDetail(req);
        return res.status(200).json(result);
      } catch (error) {
        const { statusCode, payload } = mapReadError(error, logger);
        return res.status(statusCode).json(payload);
      }
    },

    async getFleetList(req, res) {
      try {
        const result = await fleetReadService.listFleetsForAdmin(req);
        return res.status(200).json(result);
      } catch (error) {
        const { statusCode, payload } = mapReadError(error, logger);
        return res.status(statusCode).json(payload);
      }
    },

    async getFleetDetail(req, res) {
      try {
        const result = await fleetReadService.getFleetDetailForAdmin(req);
        return res.status(200).json(result);
      } catch (error) {
        const { statusCode, payload } = mapReadError(error, logger);
        return res.status(statusCode).json(payload);
      }
    },

    async getFleetSetupStatus(req, res) {
      try {
        const result = await fleetReadService.getFleetSetupStatusForAdmin(req);
        return res.status(200).json(result);
      } catch (error) {
        const { statusCode, payload } = mapReadError(error, logger);
        return res.status(statusCode).json(payload);
      }
    },
  };
}

module.exports = { createAdminFrontendReadController };
