"use strict";

function extractDocumentUrls(section) {
  if (!Array.isArray(section?.documentUrls)) {
    return [];
  }

  return section.documentUrls.filter(
    (value) => typeof value === "string" && value.trim() !== ""
  );
}

function extractInsuranceUrls(certificates) {
  if (!Array.isArray(certificates)) {
    return [];
  }

  return certificates.flatMap((certificate) =>
    extractDocumentUrls(certificate)
  );
}

function collectBusOwnerKycStorageReferences(busOwner) {
  if (!busOwner || typeof busOwner !== "object") {
    return [];
  }

  const references = [
    ...extractDocumentUrls(busOwner.companyRegistration),
    ...extractDocumentUrls(busOwner.taxRegistration),
    ...extractDocumentUrls(busOwner.transportLicense),
    ...extractInsuranceUrls(busOwner.insuranceCertificates),
  ];

  return Array.from(new Set(references));
}

module.exports = {
  collectBusOwnerKycStorageReferences,
};
