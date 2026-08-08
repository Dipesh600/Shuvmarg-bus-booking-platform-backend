"use strict";

function countDocumentUrls(section) {
  if (!Array.isArray(section?.documentUrls)) {
    return 0;
  }

  return section.documentUrls.filter(
    (value) => typeof value === "string" && value.trim() !== ""
  ).length;
}

function countBusOwnerKycDocuments(busOwner) {
  if (!busOwner || typeof busOwner !== "object") {
    return 0;
  }

  return (
    countDocumentUrls(busOwner.companyRegistration) +
    countDocumentUrls(busOwner.taxRegistration) +
    countDocumentUrls(busOwner.ownerIdentity)
  );
}

module.exports = {
  countDocumentUrls,
  countBusOwnerKycDocuments,
};
