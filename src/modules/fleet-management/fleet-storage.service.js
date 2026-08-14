"use strict";

const crypto = require("node:crypto");
const filePolicy = require("../fleet/document-lifecycle/fleet-document-file.policy");
const { processValidatedUpload } = require("../shared/security/secure-upload-processor");

const IMAGE_FIELDS = [
  ["imageFront", "FRONT"], ["imageSide", "SIDE"],
  ["imageBack", "BACK"], ["imageInside", "INSIDE"],
];

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
  validateFile = filePolicy.validateSingleFile,
  processUpload = processValidatedUpload,
}) {
  async function secureFile(file, slot) {
    validateFile(file, slot);
    const processed = await processUpload(file);
    return { file: processed, info: validateFile(processed, slot) };
  }

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
    const namedCount = IMAGE_FIELDS.filter(([field]) => files?.[field]).length;
    if (namedCount > 0 && namedCount !== 4) {
      throw new Error("Fleet photos require front, side, back, and inside images.");
    }
    for (const [field, view] of IMAGE_FIELDS) {
      if (!files?.[field]) continue;
      const processed = await secureFile(files[field], "fleetImages");
      const key = await uploadFileToS3(processed.file, storagePaths.images);
      fleetImages.push({
        imageId: crypto.randomUUID(), view, objectKey: key,
        mimeType: processed.info.mimeType, size: processed.info.size,
        uploadedAt: new Date(),
      });
      uploadedKeys.push(key);
    }
    if (fleetImages.length === 0 && (files?.fleetImages || files?.busImage)) {
      const raw = files.fleetImages || files.busImage;
      const list = Array.isArray(raw) ? raw : [raw];
      if (list.length !== 4) throw new Error("Fleet photos require front, side, back, and inside images.");
      for (let index = 0; index < list.length; index++) {
        const processed = await secureFile(list[index], "fleetImages");
        const key = await uploadFileToS3(processed.file, storagePaths.images);
        fleetImages.push({
          imageId: crypto.randomUUID(), view: IMAGE_FIELDS[index][1], objectKey: key,
          mimeType: processed.info.mimeType, size: processed.info.size,
          uploadedAt: new Date(),
        });
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
      const processed = await secureFile(files[slot], slot);
      const key = await uploadFileToS3(
        processed.file, storagePaths.document(type)
      );
      uploadedKeys.push(key);
      Object.assign(fleetDocuments[slot], {
        url: null, objectKey: key, mimeType: processed.info.mimeType,
        size: processed.info.size, uploadedAt: new Date(),
      });
    }
    return { fleetImages, fleetDocuments };
  }

  async function replaceFleetImages(fleet, files) {
    const raw = files?.fleetImages || files?.busImage;
    if (!raw) return null;
    const storagePaths = paths(fleet);
    const newKeys = [];
    const newAssets = [];
    try {
      const list = Array.isArray(raw) ? raw : [raw];
      if (list.length !== 4) throw new Error("Fleet photos require exactly four files.");
      for (let index = 0; index < list.length; index++) {
        const processed = await secureFile(list[index], "fleetImages");
        const key = await uploadFileToS3(processed.file, storagePaths.images);
        newKeys.push(key);
        newAssets.push({
          imageId: crypto.randomUUID(), view: IMAGE_FIELDS[index][1], objectKey: key,
          mimeType: processed.info.mimeType, size: processed.info.size,
          uploadedAt: new Date(),
        });
      }
      if (fleet.fleetImages?.length > 0) {
        const oldKeys = fleet.fleetImages.map((item) => item?.objectKey || item).filter(Boolean);
        deleteFromS3(oldKeys).catch((error) =>
          logger.error(
            `[S3 Orphan Cleanup Failed] Fleet ${storagePaths.fleetId}:`,
            error
          )
        );
      }
      return newAssets;
    } catch (error) {
      if (newKeys.length > 0) await deleteFromS3(newKeys);
      throw error;
    }
  }

  async function replaceDocument(fleet, docSlot, file) {
    const storagePaths = paths(fleet);
    if (docSlot === "fleetImages") {
      throw new Error("Fleet photos must be replaced together as front, side, back, and inside.");
    }
    const type = {
      fitnessCert: "fitnessCert",
      insurance: "insurance",
      bluebook: "bluebook",
      routePermit: "routePermit",
    }[docSlot];
    const processed = await secureFile(file, docSlot);
    const key = await uploadFileToS3(processed.file, storagePaths.document(type));
    Object.assign(fleet.fleetDocuments[docSlot], {
      url: null, objectKey: key, mimeType: processed.info.mimeType,
      size: processed.info.size, uploadedAt: new Date(),
    });
    return key;
  }

  return {
    uploadCreationAssets, replaceFleetImages, replaceDocument, deleteFromS3,
  };
}

module.exports = { createFleetStorageService, createFleetDocuments };
