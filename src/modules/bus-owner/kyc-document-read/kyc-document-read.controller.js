"use strict";

const { getKycDocumentReadActor } = require("./kyc-document-read-actor");
const { resolveAuthorizedKycDocumentReference } = require("./kyc-document-reference.service");

function sanitizeKycDetailDescriptors(busOwner) {
  if (!busOwner || typeof busOwner !== "object") return busOwner;
  const cloned = JSON.parse(JSON.stringify(busOwner));

  const docFields = ["companyRegistration", "taxRegistration", "transportLicense", "ownerIdentity"];
  for (const field of docFields) {
    if (cloned[field] && Array.isArray(cloned[field].documentUrls)) {
      cloned[field].fileCount = cloned[field].documentUrls.length;
      cloned[field].available = cloned[field].documentUrls.length > 0;
      delete cloned[field].documentUrls;
      delete cloned[field].documentReferences;
    }
  }

  if (Array.isArray(cloned.insuranceCertificates)) {
    cloned.insuranceCertificates = cloned.insuranceCertificates.map((cert) => {
      const item = { ...cert };
      if (Array.isArray(item.documentUrls)) {
        item.fileCount = item.documentUrls.length;
        item.available = item.documentUrls.length > 0;
        delete item.documentUrls;
        delete item.documentReferences;
      }
      return item;
    });
  }

  return cloned;
}

function createKycDocumentReadController({ BusOwner, urlService, logger = console }) {
  async function getKycDocumentReadUrl(req, res) {
    try {
      const actor = getKycDocumentReadActor(req);
      if (!actor) {
        return res.status(401).json({
          success: false,
          message: "Authentication required to read KYC document.",
        });
      }

      const ownerId = req.query?.busOwnerId || req.query?.id || req.body?.busOwnerId || req.body?.id;
      const { documentType, certificateIndex, fileIndex } = req.query?.documentType ? req.query : (req.body || {});

      if (!ownerId) {
        return res.status(400).json({ success: false, message: "Bus owner ID is required." });
      }

      let busOwnerQuery = BusOwner.findOne({
        $or: [{ _id: ownerId }, { user: ownerId }],
      });
      if (busOwnerQuery && typeof busOwnerQuery.lean === "function") {
        busOwnerQuery = busOwnerQuery.lean();
      }
      const busOwner = await busOwnerQuery;

      if (!busOwner) {
        return res.status(404).json({ success: false, message: "Bus owner KYC record not found." });
      }

      const refResult = resolveAuthorizedKycDocumentReference({
        actor,
        busOwner,
        documentType,
        certificateIndex,
        fileIndex,
        logger,
      });

      const urlData = await urlService.generateReadUrl({
        actor,
        storageReference: refResult.storageReference,
      });

      return res.status(200).json({
        success: true,
        data: urlData,
      });
    } catch (err) {
      if (err && err.statusCode) {
        return res.status(err.statusCode).json({
          success: false,
          message: err.message,
        });
      }
      console.error("getKycDocumentReadUrl error:", err);
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve document.",
      });
    }
  }

  return { getKycDocumentReadUrl, sanitizeKycDetailDescriptors };
}

module.exports = { createKycDocumentReadController, sanitizeKycDetailDescriptors };
