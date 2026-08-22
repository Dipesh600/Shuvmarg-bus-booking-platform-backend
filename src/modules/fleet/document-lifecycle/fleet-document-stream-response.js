"use strict";

const path = require("path");

const STREAMABLE_TYPES = new Set([
  "application/pdf", "image/jpeg", "image/png", "image/gif", "image/webp",
  "image/heic", "image/heif", "image/avif", "image/tiff",
]);

function resolveContentType(rawContentType, objectKey) {
  const raw = String(rawContentType || "").split(";")[0].trim().toLowerCase();
  if (raw === "image/jpg" || raw === "image/pjpeg") return "image/jpeg";
  if (STREAMABLE_TYPES.has(raw)) return raw;
  const ext = path.extname(String(objectKey || "")).toLowerCase();
  return ({
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
    ".gif": "image/gif", ".webp": "image/webp", ".heic": "image/heic",
    ".heif": "image/heif", ".avif": "image/avif", ".tif": "image/tiff",
    ".tiff": "image/tiff", ".pdf": "application/pdf",
  })[ext] || null;
}

function streamFleetDocument(result, res) {
  const body = result.object?.Body;
  const contentType = resolveContentType(result.object?.ContentType, result.targetKey);
  if (!body || typeof body.pipe !== "function") {
    const error = new Error("Fleet document body is not streamable.");
    error.statusCode = 502;
    error.code = "FLEET_DOCUMENT_STREAM_ERROR";
    throw error;
  }
  if (!contentType) {
    const error = new Error("This fleet document type cannot be previewed safely.");
    error.statusCode = 415;
    error.code = "FLEET_DOCUMENT_UNSAFE_MEDIA_TYPE";
    throw error;
  }
  const extension = contentType === "application/pdf" ? "pdf" : contentType.split("/")[1].replace("jpeg", "jpg");
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `inline; filename="${result.slot}.${extension}"`);
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
  if (result.object.ContentLength) res.setHeader("Content-Length", result.object.ContentLength);
  body.on("error", () => res.headersSent ? res.destroy() : res.status(500).end());
  body.pipe(res);
  return res;
}

module.exports = { streamFleetDocument, resolveContentType };
