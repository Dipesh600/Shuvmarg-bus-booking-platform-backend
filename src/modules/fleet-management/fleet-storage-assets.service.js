"use strict";

const crypto = require("node:crypto");

const IMAGE_FIELDS = [["imageFront", "FRONT"], ["imageSide", "SIDE"], ["imageBack", "BACK"], ["imageInside", "INSIDE"]];

function createFleetDocuments(input) {
  return {
    fitnessCert: { url: null, validTill: input.fitnessCertValidTill || null },
    insurance: { url: null, policyNumber: input.insurancePolicyNumber || null, validTill: input.insuranceValidTill || null },
    bluebook: { url: null }, routePermit: { url: null, validTill: input.routePermitValidTill || null },
  };
}

function normalizeImageFiles(files) {
  const named = IMAGE_FIELDS.filter(([field]) => files?.[field]).map(([field, view]) => ({ file: files[field], view }));
  if (named.length > 0) {
    if (named.length !== 4) throw new Error("Fleet photos require front, side, back, and inside images.");
    return named;
  }
  const raw = files?.fleetImages || files?.busImage;
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  if (list.length !== 4) throw new Error("Fleet photos require front, side, back, and inside images.");
  return list.map((file, index) => ({ file, view: IMAGE_FIELDS[index][1] }));
}

async function uploadImageAssets({ files, storagePath, secureFile, uploadFileToS3, uploadedKeys }) {
  const images = [];
  for (const { file, view } of normalizeImageFiles(files)) {
    const processed = await secureFile(file, "fleetImages");
    const key = await uploadFileToS3(processed.file, storagePath);
    images.push({ imageId: crypto.randomUUID(), view, objectKey: key, mimeType: processed.info.mimeType, size: processed.info.size, uploadedAt: new Date() });
    uploadedKeys.push(key);
  }
  return images;
}

module.exports = { IMAGE_FIELDS, createFleetDocuments, normalizeImageFiles, uploadImageAssets };
