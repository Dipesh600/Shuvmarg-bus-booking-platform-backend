"use strict";

function extractDocumentUrls(section) {
  if (!Array.isArray(section?.documentUrls)) {
    return [];
  }

  return section.documentUrls.filter(
    (value) => typeof value === "string" && value.trim() !== ""
  );
}

function collectBusOwnerKycStorageReferences(busOwner, fields = null) {
  if (!busOwner || typeof busOwner !== "object") {
    return [];
  }

  const selectedFields = fields ? new Set(fields) : null;
  const references = [];
  if (!selectedFields || selectedFields.has("companyRegistration")) references.push(...extractDocumentUrls(busOwner.companyRegistration));
  if (!selectedFields || selectedFields.has("taxRegistration")) references.push(...extractDocumentUrls(busOwner.taxRegistration));
  if (!selectedFields || selectedFields.has("ownerIdentity")) references.push(...extractDocumentUrls(busOwner.ownerIdentity));

  return Array.from(new Set(references));
}

module.exports = {
  collectBusOwnerKycStorageReferences,
};
