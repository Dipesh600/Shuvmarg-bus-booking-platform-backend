"use strict";

function sanitizeKycDetailDescriptors(busOwner) {
  if (!busOwner || typeof busOwner !== "object") return busOwner;
  const cloned = JSON.parse(JSON.stringify(busOwner));
  const scanStatus = cloned.kycSecurity?.malwareScanStatus || "quarantined";
  const documentsAvailable = scanStatus === "clean" ||
    (process.env.NODE_ENV !== "production" &&
      (scanStatus === "skipped_non_production" || !cloned.kycSecurity));

  const docFields = ["companyRegistration", "taxRegistration", "transportLicense", "ownerIdentity"];
  for (const field of docFields) {
    if (cloned[field] && Array.isArray(cloned[field].documentUrls)) {
      cloned[field].fileCount = cloned[field].documentUrls.length;
      cloned[field].available = documentsAvailable && cloned[field].documentUrls.length > 0;
      delete cloned[field].documentUrls;
      delete cloned[field].documentReferences;
    }
  }

  if (Array.isArray(cloned.insuranceCertificates)) {
    cloned.insuranceCertificates = cloned.insuranceCertificates.map((cert) => {
      const item = { ...cert };
      if (Array.isArray(item.documentUrls)) {
        item.fileCount = item.documentUrls.length;
        item.available = documentsAvailable && item.documentUrls.length > 0;
        delete item.documentUrls;
        delete item.documentReferences;
      }
      return item;
    });
  }

  delete cloned.kycAuditHistory;
  if (cloned.kycSecurity) delete cloned.kycSecurity.contentHashes;
  return cloned;
}

module.exports = { sanitizeKycDetailDescriptors };
