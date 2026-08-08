"use strict";

async function cleanupStoredDocuments({ storageService, references, logger, label }) {
  if (references.length === 0 || typeof storageService.deleteMany !== "function") return;
  try {
    const result = await storageService.deleteMany(references);
    if (result?.failed?.length > 0) logger.error(`${label} failures:`, result.failed);
  } catch (error) {
    logger.error(`${label} unexpected error:`, error);
  }
}

module.exports = { cleanupStoredDocuments };
