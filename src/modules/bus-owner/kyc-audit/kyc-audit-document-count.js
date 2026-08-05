"use strict";

const ALLOWED_SUBMISSION_FIELDS = Object.freeze([
  "companyRegistration",
  "taxRegistration",
  "transportLicense",
  "insuranceCertificates",
]);

function countValidatedKycFiles(normalizedFiles) {
  if (!normalizedFiles || typeof normalizedFiles !== "object") return 0;
  let total = 0;

  for (const field of ALLOWED_SUBMISSION_FIELDS) {
    if (Array.isArray(normalizedFiles[field])) {
      total += normalizedFiles[field].length;
    }
  }

  return total;
}

module.exports = { countValidatedKycFiles };
