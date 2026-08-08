"use strict";

function countDocumentUrls(section) {
  if (!Array.isArray(section?.documentUrls)) {
    return 0;
  }

  return section.documentUrls.filter(
    (value) => typeof value === "string" && value.trim() !== ""
  ).length;
}

function countInsuranceDocuments(certificates) {
  if (!Array.isArray(certificates)) return 0;

  return certificates.reduce(
    (total, certificate) => total + countDocumentUrls(certificate),
    0
  );
}

function countBusOwnerKycDocuments(busOwner) {
  if (!busOwner || typeof busOwner !== "object") {
    return 0;
  }

  return (
    countDocumentUrls(busOwner.companyRegistration) +
    countDocumentUrls(busOwner.taxRegistration) +
    countDocumentUrls(busOwner.transportLicense) +
    countInsuranceDocuments(busOwner.insuranceCertificates)
  );
}

module.exports = {
  countDocumentUrls,
  countInsuranceDocuments,
  countBusOwnerKycDocuments,
};
