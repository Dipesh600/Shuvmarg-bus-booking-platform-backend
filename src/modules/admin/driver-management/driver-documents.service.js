"use strict";
const { randomUUID } = require("crypto");
const AppError = require("../../../shared/errors/app-error");
const { validateKycDocuments } = require("../../bus-owner/kyc-submission/kyc-document.validator");
const { createKycMalwareScanner } = require("../../bus-owner/kyc-submission/kyc-malware-scanner.service");
const { processFile } = require("../../../../services/fileProcessor");

const SLOTS = { license: "license", medical: "medical-cert", photo: "photo" };
const TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"]);
const LICENSE_POLICY = Object.freeze({
  licenseDoc: { required: true, multiple: false, folder: "driver_docs/license" },
});

const processedExtension = file => file.mimetype === "application/pdf" ? "pdf" : "webp";
const assertProcessedFile = file => {
  const buffer = file?.data;
  const isPdf = file?.mimetype === "application/pdf" && buffer?.subarray(0, 5).toString("ascii") === "%PDF-";
  const isWebp = file?.mimetype === "image/webp" && buffer?.subarray(0, 4).toString("ascii") === "RIFF"
    && buffer?.subarray(8, 12).toString("ascii") === "WEBP";
  if (!Buffer.isBuffer(buffer) || buffer.length === 0 || (!isPdf && !isWebp)) {
    throw new AppError("The processed license document failed its final security check.", 422);
  }
};

function createDriverDocumentService({ storage, DriverProfile, logger,
  malwareScanner = createKycMalwareScanner({ logger,
    env: { ...process.env, KYC_MALWARE_SCAN_MODE: "required",
      CLAMD_HOST: process.env.CLAMD_HOST || (process.env.NODE_ENV === "production" ? "" : "127.0.0.1") } }),
  fileProcessor = processFile }) {
  const validateFiles = (files = {}, { required = false } = {}) => {
    const provided = files && typeof files === "object" ? files : {};
    const fields = Object.keys(provided);
    if (fields.some(field => field !== "licenseDoc")) {
      throw new AppError("Only one driving-license document can be uploaded.", 400);
    }
    if (!provided.licenseDoc) {
      if (required) throw new AppError("A driving-license document is required.", 400);
      return {};
    }
    return validateKycDocuments(provided, LICENSE_POLICY);
  };

  const uploadLicense = async ({ file, brandId, driverId }) => {
    const normalized = validateFiles({ licenseDoc: file }, { required: true });
    await malwareScanner.scanValidatedFiles(normalized);
    const processed = await fileProcessor(normalized.licenseDoc[0].file, {
      preset: "document",
      allowedMimes: ["image/jpeg", "image/png", "application/pdf"],
    });
    assertProcessedFile(processed);
    const folder = storage.buildS3Path({ type: "driver_docs", brandId: String(brandId),
      driverId: String(driverId), documentType: "license" });
    return storage.uploadFileToS3(processed, {
      folder,
      objectName: `${randomUUID()}.${processedExtension(processed)}`,
    });
  };

  const upload = async (driver, files, uploaded) => {
    validateFiles(files);
    if (files?.licenseDoc) {
      const key = await uploadLicense({ file: files.licenseDoc, brandId: driver.brandId, driverId: driver._id });
      uploaded.push(key); driver.licenseDoc = key;
    }
    driver.set("documents.license", { url: driver.licenseDoc || driver.documents?.license?.url || null,
      validTill: driver.licenseExpiry });
    driver.set("documents.medical", { url: driver.medicalCertDoc || driver.documents?.medical?.url || null,
      validTill: driver.medicalCertExpiry || null });
  };
  const cleanup = async keys => {
    // Only objects created by this failed request, never earlier evidence.
    for (const key of keys) {
      try { await storage.deleteObjectFromS3(key); }
      catch (error) { logger.warn("Driver upload cleanup failed", { key, error: error.message }); }
    }
  };
  const view = async (req, res) => {
    try {
      const slot = Object.hasOwn(SLOTS, req.params.slot) ? req.params.slot : null;
      if (!slot) throw new AppError("Document not found.", 404);
      const driver = await DriverProfile.findById(req.params.id).lean();
      if (!driver) throw new AppError("Driver not found.", 404);
      const key = slot === "photo" ? driver.photo : slot === "license"
        ? driver.licenseDoc || driver.documents?.license?.url : driver.medicalCertDoc || driver.documents?.medical?.url;
      const folder = storage.buildS3Path({ type: "driver_docs", brandId: String(driver.brandId),
        driverId: String(driver._id), documentType: SLOTS[slot] });
      if (typeof key !== "string" || !key.startsWith(folder + "/") || key.includes("..") || key.includes("\\")) {
        throw new AppError("Document is missing or requires secure re-upload.", 404);
      }
      const object = await storage.getObjectFromS3(key);
      if (!object.Body || !TYPES.has(object.ContentType)) {
        object.Body?.destroy?.();
        throw new AppError("This document cannot be previewed.", 415);
      }
      res.setHeader("Content-Type", object.ContentType);
      res.setHeader("Cache-Control", "no-store, private");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Disposition", `inline; filename="${slot}"`);
      object.Body.on("error", () => res.destroy());
      object.Body.pipe(res);
    } catch (error) {
      const status = error.isOperational ? error.statusCode : error.name === "CastError" ? 400
        : error.name === "NoSuchKey" ? 404 : 500;
      if (res.headersSent) return res.destroy();
      return res.status(status).json({ success: false,
        message: error.isOperational ? error.message : "Unable to load driver document." });
    }
  };
  return { validateFiles, uploadLicense, upload, cleanup, view };
}
module.exports = { createDriverDocumentService, assertProcessedFile };
