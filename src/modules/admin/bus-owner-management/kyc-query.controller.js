"use strict";

const { createAdminKycReadService } = require("../../read-contracts/admin-kyc/admin-kyc-read.service");
const { mapReadError } = require("../../read-contracts/common/read-error.mapper");

function createKycQueryController({
  readService = createAdminKycReadService(),
} = {}) {
  const getBusOwnerKycById = async (req, res) => {
    try {
      const result = await readService.getKycDetail(req);
      return res.status(200).json(result);
    } catch (error) {
      const { statusCode, payload } = mapReadError(error);
      return res.status(statusCode).json(payload);
    }
  };

  const getAllBusOwnerKycs = async (req, res) => {
    try {
      const result = await readService.listKycQueue(req);
      return res.status(200).json(result);
    } catch (error) {
      const { statusCode, payload } = mapReadError(error);
      return res.status(statusCode).json(payload);
    }
  };

  return { getBusOwnerKycById, getAllBusOwnerKycs };
}

const defaultController = createKycQueryController();

const exportsObj = {
  getBusOwnerKycById: defaultController.getBusOwnerKycById,
  getAllBusOwnerKycs: defaultController.getAllBusOwnerKycs,
};

Object.defineProperty(exportsObj, "createKycQueryController", {
  value: createKycQueryController,
  enumerable: false,
  writable: false,
  configurable: true,
});

module.exports = exportsObj;
