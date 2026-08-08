"use strict";

const REQUIRED_IDENTITY_FIELDS = [
  "busName",
  "busNumber",
  "busType",
  "vehicleType",
  "totalSeats",
];

const REQUIRED_DOCUMENTS = [
  "fitnessCert",
  "insurance",
  "bluebook",
  "routePermit",
];

function hasValidDocumentEvidence(docObj) {
  if (!docObj || typeof docObj !== "object") return false;
  const key = docObj.objectKey || docObj.storageKey;
  if (!key || typeof key !== "string" || key.trim() === "") return false;
  return Boolean(docObj.uploadedAt);
}

function evaluateFleetSubmissionReadiness(fleet) {
  if (!fleet) {
    return {
      complete: false,
      missingFields: [...REQUIRED_IDENTITY_FIELDS],
      missingDocuments: [...REQUIRED_DOCUMENTS],
      missingAssets: ["fleetImages"],
    };
  }

  const missingFields = [];
  for (const field of REQUIRED_IDENTITY_FIELDS) {
    const val = fleet[field];
    if (val === undefined || val === null || val === "" || (field === "totalSeats" && Number(val) <= 0)) {
      missingFields.push(field);
    }
  }

  const missingDocuments = [];
  const fleetDocs = fleet.fleetDocuments || {};
  for (const docSlot of REQUIRED_DOCUMENTS) {
    if (!hasValidDocumentEvidence(fleetDocs[docSlot])) {
      missingDocuments.push(docSlot);
    }
  }

  const missingAssets = [];
  const images = Array.isArray(fleet.fleetImages) ? fleet.fleetImages : [];
  const validImages = images.filter((img) => img && (img.objectKey || img.storageKey) && img.uploadedAt);
  if (validImages.length === 0) {
    missingAssets.push("fleetImages");
  }

  const complete =
    missingFields.length === 0 &&
    missingDocuments.length === 0 &&
    missingAssets.length === 0;

  return {
    complete,
    missingFields,
    missingDocuments,
    missingAssets,
  };
}

module.exports = {
  REQUIRED_IDENTITY_FIELDS,
  REQUIRED_DOCUMENTS,
  evaluateFleetSubmissionReadiness,
};
