"use strict";

const path = require("path");
const errors = require("./fleet-document.errors");
const { LEGAL_FILE_LIMITS, IMAGE_COLLECTION_LIMITS } = require("./fleet-document.constants");

const ALLOWED_MIME_BY_SLOT = Object.freeze({
  fitnessCert: ["application/pdf", "image/jpeg", "image/png"],
  insurance: ["application/pdf", "image/jpeg", "image/png"],
  bluebook: ["application/pdf", "image/jpeg", "image/png"],
  routePermit: ["application/pdf", "image/jpeg", "image/png"],
  fleetImages: ["image/jpeg", "image/png", "image/webp"],
});

const EXT_TO_MIME = Object.freeze({
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
});

function matchMagicBytes(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 4) return null;
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return "application/pdf";
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return "image/png";
  }
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x41 && buffer[10] === 0x56 && buffer[11] === 0x45
  ) {
    return null; // WAV audio, not WEBP
  }
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

function validateSingleFile(file, slot) {
  if (!file || !file.data || file.size === 0) {
    throw errors.fileRequired(slot);
  }

  const allowedMimes = ALLOWED_MIME_BY_SLOT[slot];
  const declaredMime = (file.mimetype || "").toLowerCase();
  if (!allowedMimes.includes(declaredMime)) {
    throw errors.unsupportedType(declaredMime);
  }

  const rawExt = path.extname(file.name || "file").replace(".", "").toLowerCase();
  if (!rawExt || !EXT_TO_MIME[rawExt]) {
    throw errors.signatureMismatch();
  }

  const mimeFromExt = EXT_TO_MIME[rawExt];
  if (mimeFromExt !== declaredMime) {
    throw errors.signatureMismatch();
  }

  const magicMime = matchMagicBytes(file.data);
  if (!magicMime || magicMime !== declaredMime) {
    throw errors.signatureMismatch();
  }

  const maxBytes = slot === "fleetImages"
    ? IMAGE_COLLECTION_LIMITS.MAX_FILE_SIZE_BYTES
    : LEGAL_FILE_LIMITS.MAX_FILE_SIZE_BYTES;

  if (file.size > maxBytes) {
    throw errors.fileTooLarge(maxBytes / (1024 * 1024));
  }

  return {
    extension: rawExt === "jpg" ? "jpeg" : rawExt,
    mimeType: declaredMime,
    size: file.size,
  };
}

function validateFileCollection(files, slot) {
  return files.map((file) => validateSingleFile(file, slot));
}

module.exports = {
  validateSingleFile,
  validateFileCollection,
  matchMagicBytes,
};
