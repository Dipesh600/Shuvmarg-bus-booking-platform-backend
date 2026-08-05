const crypto = require("node:crypto");

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

function createFleetDocumentStorageService(deps = {}) {
  const uploadFileToS3 = deps.uploadFileToS3;
  const deleteObjectFromS3 = deps.deleteObjectFromS3;

  async function uploadPrivate({ file, objectKey }) {
    if (!uploadFileToS3) {
      throw new Error("uploadFileToS3 function is required.");
    }
    const resultKey = await uploadFileToS3(file, { objectKey });
    return resultKey || objectKey;
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
};
