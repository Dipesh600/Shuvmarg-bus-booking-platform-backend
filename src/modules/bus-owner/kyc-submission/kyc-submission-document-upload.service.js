"use strict";

async function uploadOnboardingDocuments({
  normalizedFiles,
  storageService,
  ownerId,
  busOwner,
  newlyUploadedObjectKeys = [],
}) {
  const singleDocFields = ["companyRegistration", "taxRegistration", "ownerIdentity"];

  for (const field of singleDocFields) {
    if (normalizedFiles[field]) {
      const documentObjectKeys = [];
      for (const validatedFile of normalizedFiles[field]) {
        const key = await storageService.uploadDocument({
          validatedFile,
          ownerId,
          documentType: field,
        });
        newlyUploadedObjectKeys.push(key);
        documentObjectKeys.push(key);
      }
      busOwner[field] = busOwner[field] || {};
      busOwner[field].documentUrls = documentObjectKeys;
      busOwner[field].verified = false;
      busOwner[field].rejectionReason = null;
    }
  }

  return newlyUploadedObjectKeys;
}

module.exports = { uploadOnboardingDocuments };
