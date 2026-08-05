"use strict";

const { createAdminBusOwnerReadService } = require("../../read-contracts/admin-bus-owner/admin-bus-owner-read.service");
const { mapReadError } = require("../../read-contracts/common/read-error.mapper");

const defaultService = createAdminBusOwnerReadService();

function createOwnerQueryController({
  adminBusOwnerReadService = defaultService,
} = {}) {
  return {
    async getAllBusOwners(req, res) {
      try {
        const result = await adminBusOwnerReadService.listBusOwners(req);
        return res.status(200).json(result);
      } catch (error) {
        const { statusCode, payload } = mapReadError(error);
        return res.status(statusCode).json(payload);
      }
    },

    async getBusOwnerById(req, res) {
      try {
        const id = req.body?.id || req.query?.id || req.params?.id;
        if (!id) {
          return res.status(400).json({ success: false, message: "Id is required!" });
        }
        const mongoose = require("mongoose");
        if (!mongoose.Types.ObjectId.isValid(id)) {
          return res.status(400).json({ success: false, message: "Invalid id format!" });
        }
        const result = await adminBusOwnerReadService.getBusOwnerDetail(req);
        return res.status(200).json(result);
      } catch (error) {
        const { statusCode, payload } = mapReadError(error);
        return res.status(statusCode).json(payload);
      }
    },
  };
}

const defaultController = createOwnerQueryController();

const exportsObj = {
  getAllBusOwners: defaultController.getAllBusOwners,
  getBusOwnerById: defaultController.getBusOwnerById,
};

Object.defineProperty(exportsObj, "createOwnerQueryController", {
  value: createOwnerQueryController,
  enumerable: false,
  writable: false,
  configurable: true,
});

module.exports = exportsObj;
