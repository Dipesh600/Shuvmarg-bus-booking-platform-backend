"use strict";

const DOCUMENTS = [
  ["companyRegistration", "bus_owner_kyc/company_registration"],
  ["taxRegistration", "bus_owner_kyc/tax_registration"],
  ["transportLicense", "bus_owner_kyc/transport_license"],
];

function unauthorized(res) {
  return res.status(401).json({
    success: false,
    message: "Unauthorized. Please login first.",
  });
}

function createKycSubmissionController({
  BusOwner,
  uploadService,
  logger = console,
}) {
  async function submitBusOwnerKyc(req, res) {
    try {
      const userId = req.userInfo?.id;
      if (!userId) return unauthorized(res);
      let busOwner = await BusOwner.findOne({ user: userId });
      if (!busOwner) busOwner = new BusOwner({ user: userId });
      const files = req.files || {};
      for (const [field, folder] of DOCUMENTS) {
        if (!files[field]) continue;
        const urls = await uploadService.uploadMany(files[field], folder);
        busOwner[field] = busOwner[field] || {};
        busOwner[field].documentUrls = urls;
        busOwner[field].verified = false;
        busOwner[field].rejectionReason = null;
      }
      if (files.insuranceCertificates) {
        const urls = await uploadService.uploadMany(
          files.insuranceCertificates,
          "bus_owner_kyc/insurance"
        );
        busOwner.insuranceCertificates = urls.map((url) => ({
          insurerName: null,
          policyNumber: null,
          validTill: null,
          documentUrls: [url],
          verified: false,
          rejectionReason: null,
        }));
      }
      busOwner.verificationStatus = "pending";
      busOwner.rejectionReason = null;
      await busOwner.save();
      return res.status(200).json({
        success: true,
        message: "Bus owner KYC submitted successfully",
      });
    } catch (error) {
      logger.error("submitBusOwnerKyc error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal Server Error",
        error: error.message,
      });
    }
  }

  async function getMyBusOwnerKycStatus(req, res) {
    try {
      const userId = req.userInfo?.id;
      if (!userId) return unauthorized(res);
      const owner = await BusOwner.findOne({ user: userId }).lean();
      if (!owner) {
        return res.status(404).json({
          success: false,
          message: "Bus owner KYC not found. Please submit your KYC.",
        });
      }
      const fields = [
        "verificationStatus", "rejectionReason", "companyRegistration",
        "taxRegistration", "transportLicense", "insuranceCertificates",
        "createdAt", "updatedAt",
      ];
      return res.status(200).json({
        success: true,
        message: "Bus owner KYC status fetched successfully",
        data: Object.fromEntries(fields.map((field) => [field, owner[field]])),
      });
    } catch (error) {
      logger.error("getMyBusOwnerKycStatus error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal Server Error",
        error: error.message,
      });
    }
  }

  return { submitBusOwnerKyc, getMyBusOwnerKycStatus };
}

module.exports = { createKycSubmissionController, DOCUMENTS };
