"use strict";

const { createAdminKycReadService } = require("../../read-contracts/admin-kyc/admin-kyc-read.service");
const { mapReadError } = require("../../read-contracts/common/read-error.mapper");
const { sanitizeKycDetailDescriptors } = require("../../bus-owner/kyc-document-read/kyc-document-read.controller");

function createKycQueryController(options = {}) {
  const { BusOwnerModel, kycDocumentReadService, readService = createAdminKycReadService() } = options;

  const getBusOwnerKycById = async (req, res) => {
    try {
      if (BusOwnerModel || kycDocumentReadService) {
        const id = req.body?.id || req.query?.id || req.params?.id;
        const Model = BusOwnerModel || require("../../../../models/busOwnerModel");
        let owner = await Model.findOne({ user: id }).lean();
        if (!owner) {
          owner = await Model.findById(id).lean();
        }
        if (!owner) {
          return res.status(404).json({ success: false, message: "Bus owner KYC not found." });
        }
        const resolved = kycDocumentReadService
          ? await kycDocumentReadService.resolveOwnerKycDocuments(owner)
          : owner;
        const sanitized = sanitizeKycDetailDescriptors(resolved);
        return res.status(200).json({ success: true, data: sanitized });
      }
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
