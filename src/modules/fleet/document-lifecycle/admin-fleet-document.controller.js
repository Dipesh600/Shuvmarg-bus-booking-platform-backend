"use strict";

const path = require("path");
const { mapErrorToResponse } = require("./fleet-document-error.mapper");

// Normalize raw S3 ContentType to one of our allowed streaming types.
// Fallback: infer from the objectKey file extension.
function resolveStreamingContentType(rawContentType, objectKey) {
  const raw = (rawContentType || "").split(";")[0].trim().toLowerCase();

  // Direct aliases and variants
  const IMAGE_TYPES = new Set([
    "image/jpeg",
    "image/jpg",
    "image/pjpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/heic",
    "image/heif",
    "image/avif",
    "image/tiff",
  ]);

  if (raw === "image/jpg" || raw === "image/pjpeg") return "image/jpeg";
  if (IMAGE_TYPES.has(raw)) return raw;
  if (raw === "application/pdf") return "application/pdf";

  // Unknown or octet-stream: try to infer from the S3 key extension
  if (objectKey) {
    const ext = path.extname(String(objectKey)).toLowerCase().replace(".", "");
    if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
    if (ext === "png") return "image/png";
    if (ext === "gif") return "image/gif";
    if (ext === "webp") return "image/webp";
    if (ext === "heic" || ext === "heif") return "image/heic";
    if (ext === "pdf") return "application/pdf";
  }

  return null; // truly unsupported
}

const STREAMABLE_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/avif",
  "image/tiff",
]);

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

      const body = result.object?.Body;
      const rawType = result.object?.ContentType || "";
      const objectKey = result.targetKey || "";

      const contentType = resolveStreamingContentType(rawType, objectKey);

      if (!body || typeof body.pipe !== "function") {
        const err = new Error("Fleet document body is not streamable.");
        err.statusCode = 502;
        err.code = "FLEET_DOCUMENT_STREAM_ERROR";
        throw err;
      }

      if (!contentType || !STREAMABLE_TYPES.has(contentType)) {
        const err = new Error("This fleet document type cannot be previewed safely.");
        err.statusCode = 415;
        err.code = "FLEET_DOCUMENT_UNSAFE_MEDIA_TYPE";
        throw err;
      }

      const ext =
        contentType === "application/pdf" ? "pdf" :
        contentType === "image/png" ? "png" :
        contentType === "image/gif" ? "gif" :
        contentType === "image/webp" ? "webp" :
        (contentType === "image/heic" || contentType === "image/heif") ? "heic" :
        "jpg";

      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `inline; filename="${slot}.${ext}"`);
      res.setHeader("Cache-Control", "private, no-store, max-age=0");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
      if (result.object.ContentLength) res.setHeader("Content-Length", result.object.ContentLength);

      body.on("error", () => {
        if (!res.headersSent) res.status(500).end();
        else res.destroy();
      });
      body.pipe(res);
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
