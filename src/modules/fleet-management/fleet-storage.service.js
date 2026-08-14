"use strict";

const filePolicy = require("../fleet/document-lifecycle/fleet-document-file.policy");
const { processValidatedUpload } = require("../shared/security/secure-upload-processor");
const { createFleetDocuments, normalizeImageFiles, uploadImageAssets } = require("./fleet-storage-assets.service");

function createFleetStorageService({ uploadFileToS3, buildS3Path, deleteFromS3, logger = console, validateFile = filePolicy.validateSingleFile, processUpload = processValidatedUpload }) {
  async function secureFile(file, slot) {
    validateFile(file, slot);
    const processed = await processUpload(file);
    return { file: processed, info: validateFile(processed, slot) };
  }
  function paths(fleet) {
    const fleetId = fleet.fleetId || fleet._id.toString();
    const base = { ownerId: fleet.ownerId.toString(), brandId: fleet.brandId ? fleet.brandId.toString() : null, fleetId };
    return { fleetId, images: buildS3Path({ type: "fleet_images", ...base }), document: (documentType) => buildS3Path({ type: "fleet_docs", ...base, documentType }) };
  }
  async function uploadCreationAssets(fleet, input, files, uploadedKeys) {
    const storagePaths = paths(fleet);
    const fleetImages = await uploadImageAssets({ files, storagePath: storagePaths.images, secureFile, uploadFileToS3, uploadedKeys });
    const fleetDocuments = createFleetDocuments(input);
    for (const [slot, type] of [["fitnessCert", "fitness-cert"], ["insurance", "insurance"], ["bluebook", "bluebook"], ["routePermit", "route-permit"]]) {
      if (!files?.[slot]) continue;
      const processed = await secureFile(files[slot], slot);
      const key = await uploadFileToS3(processed.file, storagePaths.document(type));
      uploadedKeys.push(key);
      Object.assign(fleetDocuments[slot], { url: null, objectKey: key, mimeType: processed.info.mimeType, size: processed.info.size, uploadedAt: new Date() });
    }
    return { fleetImages, fleetDocuments };
  }
  async function replaceFleetImages(fleet, files) {
    if (!files?.fleetImages && !files?.busImage) return null;
    const storagePaths = paths(fleet); const newKeys = [];
    try {
      const newAssets = await uploadImageAssets({ files, storagePath: storagePaths.images, secureFile, uploadFileToS3, uploadedKeys: newKeys });
      const oldKeys = (fleet.fleetImages || []).map((item) => item?.objectKey || item).filter(Boolean);
      if (oldKeys.length) deleteFromS3(oldKeys).catch((error) => logger.error(`[S3 Orphan Cleanup Failed] Fleet ${storagePaths.fleetId}:`, error));
      return newAssets;
    } catch (error) { if (newKeys.length) await deleteFromS3(newKeys); throw error; }
  }
  async function replaceDocument(fleet, docSlot, file) {
    if (docSlot === "fleetImages") throw new Error("Fleet photos must be replaced together as front, side, back, and inside.");
    const type = { fitnessCert: "fitnessCert", insurance: "insurance", bluebook: "bluebook", routePermit: "routePermit" }[docSlot];
    const processed = await secureFile(file, docSlot); const key = await uploadFileToS3(processed.file, paths(fleet).document(type));
    Object.assign(fleet.fleetDocuments[docSlot], { url: null, objectKey: key, mimeType: processed.info.mimeType, size: processed.info.size, uploadedAt: new Date() });
    return key;
  }
  return { uploadCreationAssets, replaceFleetImages, replaceDocument, deleteFromS3 };
}

module.exports = { createFleetStorageService, createFleetDocuments, normalizeImageFiles };
