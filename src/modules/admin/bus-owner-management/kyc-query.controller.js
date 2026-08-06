"use strict";

const { createAdminKycReadService } = require("../../read-contracts/admin-kyc/admin-kyc-read.service");
const { mapReadError } = require("../../read-contracts/common/read-error.mapper");
const { sanitizeKycDetailDescriptors } = require("../../bus-owner/kyc-document-read/kyc-document-read.controller");

const defaultService = createAdminKycReadService();

function createKycQueryController(options = {}) {
  const { BusOwnerModel, kycDocumentReadService, readService = defaultService } = options;

  const getBusOwnerKycById = async (req, res) => {
    try {
      const id = req.params?.kycId || req.params?.id || req.body?.kycId || req.body?.id;
      if (id) {
        req.params = req.params || {};
        req.params.kycId = id;
      }
      if (BusOwnerModel || kycDocumentReadService) {
        if (!id) {
          return res.status(400).json({ success: false, message: "Id is required!" });
        }
        const mongoose = require("mongoose");
        if (!mongoose.Types.ObjectId.isValid(id)) {
          return res.status(400).json({ success: false, message: "Invalid id format!" });
        }
        const Model = BusOwnerModel || require("../../../../models/busOwnerModel");
        let query1 = Model.findOne({ user: id });
        if (query1 && typeof query1.lean !== "function" && typeof query1.populate === "function") {
          query1 = query1.populate();
        }
        let owner = typeof query1?.lean === "function" ? await query1.lean() : await query1;

        if (!owner) {
          let query2 = Model.findById(id);
          if (query2 && typeof query2.lean !== "function" && typeof query2.populate === "function") {
            query2 = query2.populate();
          }
          owner = typeof query2?.lean === "function" ? await query2.lean() : await query2;
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
      const result = await (readService.listKycQueue ? readService.listKycQueue(req) : readService.listKycs(req));
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
