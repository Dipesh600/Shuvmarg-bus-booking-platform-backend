"use strict";

const crypto = require("node:crypto");

class FleetStorageContractError extends Error {
  constructor(message, context = {}) {
    super(message);
    this.name = "FleetStorageContractError";
    this.uploadedObjectKey = context.uploadedObjectKey;
  }
}

function randomUuid() {
  return crypto.randomUUID();
}

function buildPrivateObjectKey(fleetId, slot, extension) {
  const uuid = randomUuid();
  const ext = (extension || "bin").replace(/^\./, "").toLowerCase();
  if (slot === "fleetImages") {
    return `fleet-images/${fleetId}/${uuid}.${ext}`;
  }
  return `fleet-documents/${fleetId}/${slot}/${uuid}.${ext}`;
}

function extractKeyFromUrl(urlStr) {
  try {
    const parsed = new URL(urlStr);
    const pathname = parsed.pathname.replace(/^\/+/, "");
    return pathname || null;
  } catch {
    return null;
  }
}

async function safeDeleteUploadedKey(deleteObjectFromS3, key, logger) {
  if (!key || !deleteObjectFromS3) return;
  try {
    await deleteObjectFromS3(key);
  } catch (err) {
    if (logger && logger.error) {
      logger.error(`[S3 Mismatch Compensation Delete Failed] Key: ${key}:`, err);
    }
  }
}

function createFleetDocumentStorageService(deps = {}) {
  const uploadFileToS3 = deps.uploadFileToS3;
  const deleteObjectFromS3 = deps.deleteObjectFromS3;

  async function uploadPrivate({ file, objectKey }, logger = console) {
    if (!uploadFileToS3) {
      throw new Error("uploadFileToS3 function is required.");
    }
    const result = await uploadFileToS3(file, { objectKey, private: true });

    const storedKey =
      typeof result === "string"
        ? result
        : result?.objectKey || result?.key;

    if (!storedKey) {
      throw new FleetStorageContractError("Storage upload did not return an object key.");
    }

    if (/^https?:\/\//i.test(storedKey)) {
      const derivedKey = extractKeyFromUrl(storedKey);
      if (derivedKey) {
        await safeDeleteUploadedKey(deleteObjectFromS3, derivedKey, logger);
      }
      throw new FleetStorageContractError(
        "Storage returned a public URL instead of an object key.",
        { uploadedObjectKey: derivedKey }
      );
    }

    if (objectKey && storedKey !== objectKey) {
      await safeDeleteUploadedKey(deleteObjectFromS3, storedKey, logger);
      throw new FleetStorageContractError(
        "Storage returned an unexpected object key.",
        { uploadedObjectKey: storedKey }
      );
    }

    return storedKey;
  }

  async function deleteNewObjectOrReport(keys, logger = console) {
    if (!keys || !deleteObjectFromS3) return;
    const keyList = Array.isArray(keys) ? keys : [keys];
    for (const key of keyList) {
      if (!key) continue;
      try {
        await deleteObjectFromS3(key);
      } catch (err) {
        logger.error(`[S3 Compensation Delete Failed] Key: ${key}:`, err);
      }
    }
  }

  async function deleteOldObjectBestEffort(keys, logger = console) {
    if (!keys || !deleteObjectFromS3) return;
    const keyList = Array.isArray(keys) ? keys : [keys];
    for (const key of keyList) {
      if (!key) continue;
      try {
        await deleteObjectFromS3(key);
      } catch (err) {
        logger.error(`[S3 Old Asset Delete Failed] Key: ${key}:`, err);
      }
    }
  }

  return {
    buildPrivateObjectKey,
    uploadPrivate,
    deleteNewObjectOrReport,
    deleteOldObjectBestEffort,
  };
}

module.exports = {
  buildPrivateObjectKey,
  createFleetDocumentStorageService,
  FleetStorageContractError,
};
