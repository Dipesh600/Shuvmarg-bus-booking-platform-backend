"use strict";

const crypto = require("node:crypto");

const IMAGE_FIELDS = ["imageFront", "imageBack", "imageSide", "imageInside"];

function buildFleetImageAsset(file, objectKey, uploadedAt = new Date()) {
  return {
    imageId: crypto.randomUUID(),
    objectKey,
    mimeType: file?.mimetype || "application/octet-stream",
    size: file?.size || 0,
    uploadedAt,
  };
}

function assignFleetDocumentAsset(target, file, objectKey, uploadedAt = new Date()) {
  target.url = objectKey;
  target.objectKey = objectKey;
  target.mimeType = file?.mimetype || "application/octet-stream";
  target.size = file?.size || 0;
  target.uploadedAt = uploadedAt;
}

function createFleetDocuments(input) {
  return {
    fitnessCert: {
      url: null, validTill: input.fitnessCertValidTill || null,
    },
    insurance: {
      url: null,
      policyNumber: input.insurancePolicyNumber || null,
      validTill: input.insuranceValidTill || null,
    },
    bluebook: { url: null },
    routePermit: {
      url: null, validTill: input.routePermitValidTill || null,
    },
  };
}

function createFleetStorageService({
  uploadFileToS3,
  buildS3Path,
  deleteFromS3,
  logger = console,
}) {
  function paths(fleet) {
    const fleetId = fleet.fleetId || fleet._id.toString();
    const base = {
      ownerId: fleet.ownerId.toString(),
      brandId: fleet.brandId ? fleet.brandId.toString() : null,
      fleetId,
    };
    return {
      fleetId,
      images: buildS3Path({ type: "fleet_images", ...base }),
      document: (documentType) => buildS3Path({
        type: "fleet_docs", ...base, documentType,
      }),
    };
  }

  async function uploadCreationAssets(fleet, input, files, uploadedKeys) {
    const storagePaths = paths(fleet);
    const fleetImages = [];
    const uploadedAt = new Date();
    for (const field of IMAGE_FIELDS) {
      if (!files?.[field]) continue;
      const key = await uploadFileToS3(files[field], storagePaths.images);
      fleetImages.push(buildFleetImageAsset(files[field], key, uploadedAt));
      uploadedKeys.push(key);
    }
    if (fleetImages.length === 0 && (files?.fleetImages || files?.busImage)) {
      const raw = files.fleetImages || files.busImage;
      for (const file of Array.isArray(raw) ? raw : [raw]) {
        const key = await uploadFileToS3(file, storagePaths.images);
        fleetImages.push(buildFleetImageAsset(file, key, uploadedAt));
        uploadedKeys.push(key);
      }
    }
    const fleetDocuments = createFleetDocuments(input);
    const slots = [
      ["fitnessCert", "fitness-cert"],
      ["insurance", "insurance"],
      ["bluebook", "bluebook"],
      ["routePermit", "route-permit"],
    ];
    for (const [slot, type] of slots) {
      if (!files?.[slot]) continue;
      const key = await uploadFileToS3(
        files[slot], storagePaths.document(type)
      );
      uploadedKeys.push(key);
      assignFleetDocumentAsset(fleetDocuments[slot], files[slot], key, uploadedAt);
    }
    return { fleetImages, fleetDocuments };
  }

  async function replaceFleetImages(fleet, files) {
    const raw = files?.fleetImages || files?.busImage;
    if (!raw) return null;
    const storagePaths = paths(fleet);
    const newAssets = [];
    const uploadedKeys = [];
    try {
      for (const file of Array.isArray(raw) ? raw : [raw]) {
        const key = await uploadFileToS3(file, storagePaths.images);
        uploadedKeys.push(key);
        newAssets.push(buildFleetImageAsset(file, key));
      }
      if (fleet.fleetImages?.length > 0) {
        const oldKeys = fleet.fleetImages
          .map((image) => typeof image === "string" ? image : image?.objectKey || image?.url)
          .filter(Boolean);
        deleteFromS3(oldKeys).catch((error) =>
          logger.error(
            `[S3 Orphan Cleanup Failed] Fleet ${storagePaths.fleetId}:`,
            error
          )
        );
      }
      return newAssets;
    } catch (error) {
      if (uploadedKeys.length > 0) await deleteFromS3(uploadedKeys);
      throw error;
    }
  }

  async function replaceDocument(fleet, docSlot, file) {
    const storagePaths = paths(fleet);
    if (docSlot === "fleetImages") {
      const key = await uploadFileToS3(file, storagePaths.images);
      fleet.fleetImages = [buildFleetImageAsset(file, key)];
      return key;
    }
    const type = {
      fitnessCert: "fitnessCert",
      insurance: "insurance",
      bluebook: "bluebook",
      routePermit: "routePermit",
    }[docSlot];
    const key = await uploadFileToS3(file, storagePaths.document(type));
    assignFleetDocumentAsset(fleet.fleetDocuments[docSlot], file, key);
    return key;
  }

  return {
    uploadCreationAssets, replaceFleetImages, replaceDocument, deleteFromS3,
  };
}

module.exports = { createFleetStorageService, createFleetDocuments };
