"use strict";

const { getKycDocumentReadActor } = require("./kyc-document-read-actor");
const { resolveAuthorizedKycDocumentReference } = require("./kyc-document-reference.service");
const { KycDocumentReadError } = require("./kyc-document-read.errors");
const { sanitizeKycDetailDescriptors } = require("./kyc-document-descriptor-sanitizer");

function createKycDocumentReadController({ BusOwner, urlService, logger = console }) {
  async function resolveRequest(req) {
    const actor = getKycDocumentReadActor(req);
    if (!actor) {
      throw new KycDocumentReadError(
        "KYC_DOCUMENT_READ_UNAUTHORIZED",
        "Authentication required to read KYC document.",
        401
      );
    }
    const ownerId =
      req.query?.busOwnerId ||
      req.query?.id ||
      req.body?.busOwnerId ||
      req.body?.id ||
      (actor.type === "BUS_OWNER" ? actor.userId : null);
    const { documentType, certificateIndex, fileIndex } = req.query?.documentType ? req.query : (req.body || {});
    if (!ownerId) {
      throw new KycDocumentReadError(
        "KYC_DOCUMENT_READ_INVALID_REQUEST",
        "Bus owner ID is required.",
        400
      );
    }
    let busOwnerQuery = BusOwner.findOne({ $or: [{ _id: ownerId }, { user: ownerId }] });
    if (busOwnerQuery && typeof busOwnerQuery.lean === "function") busOwnerQuery = busOwnerQuery.lean();
    const busOwner = await busOwnerQuery;
    if (!busOwner) {
      throw new KycDocumentReadError(
        "KYC_DOCUMENT_READ_NOT_FOUND",
        "Bus owner KYC record not found.",
        404
      );
    }
    const reference = resolveAuthorizedKycDocumentReference({ actor, busOwner, documentType, certificateIndex, fileIndex, logger });
    return { actor, reference };
  }

  async function getKycDocumentReadUrl(req, res) {
    try {
      const { actor, reference } = await resolveRequest(req);

      const urlData = await urlService.generateReadUrl({
        actor,
        storageReference: reference.storageReference,
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

  async function viewKycDocument(req, res) {
    try {
      const { reference } = await resolveRequest(req);
      if (!urlService || typeof urlService.fetchDocument !== "function") {
        throw new Error("KYC document streaming is unavailable.");
      }
      if (/^https?:\/\//i.test(reference.storageReference)) {
        throw new KycDocumentReadError(
          "KYC_DOCUMENT_LEGACY_REFERENCE",
          "This legacy document must be migrated before it can be previewed securely.",
          422
        );
      }
      const object = await urlService.fetchDocument(reference.storageReference);
      const allowedContentTypes = new Set(["application/pdf", "image/jpeg", "image/png"]);
      if (!object?.Body || typeof object.Body.pipe !== "function" || !allowedContentTypes.has(object.ContentType)) {
        throw new KycDocumentReadError(
          "KYC_DOCUMENT_UNSAFE_MEDIA_TYPE",
          "This document type cannot be previewed safely.",
          415
        );
      }
      const contentType = object.ContentType;
      const extension = contentType === "application/pdf" ? "pdf" : contentType === "image/png" ? "png" : "jpg";

      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `inline; filename="${reference.documentType}.${extension}"`);
      res.setHeader("Cache-Control", "private, no-store, max-age=0");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
      if (object.ContentLength) res.setHeader("Content-Length", object.ContentLength);

      object.Body.on("error", (error) => {
        logger.error("KYC document stream failed", { message: error?.message || "stream error" });
        if (!res.headersSent) res.status(500).end();
        else res.destroy(error);
      });
      object.Body.pipe(res);
      return res;
    } catch (err) {
      if (err && err.statusCode) {
        return res.status(err.statusCode).json({ success: false, message: err.message });
      }
      logger.error("viewKycDocument error", { message: err?.message || "unknown error" });
      return res.status(500).json({ success: false, message: "Failed to retrieve document." });
    }
  }

  return { getKycDocumentReadUrl, viewKycDocument, sanitizeKycDetailDescriptors };
}

module.exports = { createKycDocumentReadController, sanitizeKycDetailDescriptors };
