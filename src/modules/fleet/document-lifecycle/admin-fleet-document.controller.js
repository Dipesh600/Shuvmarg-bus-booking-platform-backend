"use strict";

const { mapErrorToResponse } = require("./fleet-document-error.mapper");

function createAdminFleetDocumentController({ uploadService, readService }) {
  async function uploadDocument(req, res) {
    try {
      const fleetId = req.params.fleetId || req.params.id;
      const slot = req.params.slot || req.body.docSlot;
      const result = await uploadService.uploadDocument({
        fleetId,
        slot,
        body: req.body,
        files: req.files,
        actorContext: { adminInfo: req.adminInfo },
      });
      return res.status(200).json(result);
    } catch (error) {
      return mapErrorToResponse(error, res);
    }
  }

  async function getDocumentReadUrl(req, res) {
    try {
      const fleetId = req.params.fleetId || req.params.id;
      const slot = req.params.slot;
      const imageId = req.query.imageId;
      const imageIndex = req.query.imageIndex;
      const result = await readService.getDocumentReadUrl({
        fleetId,
        slot,
        imageId,
        imageIndex,
        actorContext: { adminInfo: req.adminInfo },
      });
      return res.status(200).json(result);
    } catch (error) {
      return mapErrorToResponse(error, res);
    }
  }

  async function viewDocument(req, res) {
    try {
      const fleetId = req.params.fleetId || req.params.id;
      const slot = req.params.slot;
      const result = await readService.getDocumentObject({
        fleetId,
        slot,
        imageId: req.query.imageId,
        imageIndex: req.query.imageIndex,
        actorContext: { adminInfo: req.adminInfo },
      });
      const rawType = (result.object?.ContentType || "").split(";")[0].trim().toLowerCase();
      const contentType = rawType === "image/jpg" || rawType === "image/pjpeg" ? "image/jpeg" : rawType;
      const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png"]);
      if (!result.object?.Body || typeof result.object.Body.pipe !== "function" || !allowedTypes.has(contentType)) {
        const error = new Error("This fleet document type cannot be previewed safely.");
        error.statusCode = 415;
        error.code = "FLEET_DOCUMENT_UNSAFE_MEDIA_TYPE";
        throw error;
      }

      const extension = contentType === "application/pdf" ? "pdf" : contentType === "image/png" ? "png" : "jpg";
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `inline; filename="${slot}.${extension}"`);
      res.setHeader("Cache-Control", "private, no-store, max-age=0");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
      if (result.object.ContentLength) res.setHeader("Content-Length", result.object.ContentLength);
      result.object.Body.on("error", () => {
        if (!res.headersSent) res.status(500).end();
        else res.destroy();
      });
      result.object.Body.pipe(res);
      return res;
    } catch (error) {
      return mapErrorToResponse(error, res);
    }
  }

  return {
    uploadDocument,
    getDocumentReadUrl,
    viewDocument,
  };
}

module.exports = createAdminFleetDocumentController;
