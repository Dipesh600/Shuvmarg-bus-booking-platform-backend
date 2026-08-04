"use strict";

const BusOwner = require("../../../../models/busOwnerModel.js");
const { getPresignedUrl } = require("../../../../services/s3Service.js");
const { createKycDocumentReadService } = require("../../bus-owner/kyc-submission/kyc-document-read.service.js");
const { sanitizeKycDetailDescriptors } = require("../../bus-owner/kyc-document-read/kyc-document-read.controller.js");
const { isValidObjectId } = require("./request-validation.policy.js");

const defaultKycDocumentReadService = createKycDocumentReadService({ getPresignedUrl });

function createKycQueryController({
  BusOwnerModel = BusOwner,
  kycDocumentReadService = defaultKycDocumentReadService,
} = {}) {
  const findKyc = async (id) => {
    let owner = await BusOwnerModel.findOne({ user: id })
      .populate("user", "name email phone role")
      .lean();
    if (!owner) {
      owner = await BusOwnerModel.findById(id)
        .populate("user", "name email phone role")
        .lean();
    }
    return owner;
  };

  const getBusOwnerKycById = async (req, res) => {
    try {
      const { id } = req.body;
      if (!id) {
        return res.status(400).json({ success: false, message: "Id is required!" });
      }
      if (!isValidObjectId(id)) {
        return res.status(400).json({ success: false, message: "Invalid id format!" });
      }
      const owner = await findKyc(id);
      if (!owner) {
        return res.status(404).json({ success: false, message: "Bus owner KYC not found!" });
      }
      const resolved = await kycDocumentReadService.resolveOwnerKycDocuments(owner);
      return res.status(200).json({
        success: true,
        message: "Bus owner KYC details retrieved successfully!",
        data: sanitizeKycDetailDescriptors(resolved),
      });
    } catch (error) {
      console.error("getBusOwnerKycById error:", error);
      return res.status(500).json({ success: false, message: "Internal Server Error!" });
    }
  };

  const getAllBusOwnerKycs = async (req, res) => {
    try {
      const filter = {};
      if (req.query.verificationStatus) {
        filter.verificationStatus = req.query.verificationStatus;
      }
      const rawList = await BusOwnerModel.find(filter)
        .populate("user", "name email phone role")
        .sort({ createdAt: -1 })
        .lean();

      const data = await Promise.all(
        rawList.map(async (owner) =>
          sanitizeKycDetailDescriptors(await kycDocumentReadService.resolveOwnerKycDocuments(owner))
        )
      );

      return res.status(200).json({
        success: true,
        message:
          data.length === 0
            ? "No KYC records found."
            : "Bus owner KYC records retrieved successfully!",
        results: data.length,
        data,
      });
    } catch (error) {
      console.error("getAllBusOwnerKycs error:", error);
      return res.status(500).json({ success: false, message: "Internal Server Error!" });
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
