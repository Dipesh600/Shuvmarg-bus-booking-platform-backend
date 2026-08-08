"use strict";

async function uploadOnboardingDocuments({
  normalizedFiles,
  storageService,
  ownerId,
  busOwner,
  newlyUploadedObjectKeys = [],
}) {
  const singleDocFields = ["companyRegistration", "taxRegistration", "transportLicense"];

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

  if (normalizedFiles.insuranceCertificates) {
    const insuranceItems = [];
    for (const validatedFile of normalizedFiles.insuranceCertificates) {
      const key = await storageService.uploadDocument({
        validatedFile,
        ownerId,
        documentType: "insuranceCertificates",
      });
      newlyUploadedObjectKeys.push(key);
      insuranceItems.push({
        insurerName: null,
        policyNumber: null,
        validTill: null,
        documentUrls: [key],
        verified: false,
        rejectionReason: null,
      });
    }
    busOwner.insuranceCertificates = insuranceItems;
  }

  return newlyUploadedObjectKeys;
}

module.exports = { uploadOnboardingDocuments };
