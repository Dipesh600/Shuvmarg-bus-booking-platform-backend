"use strict";

const applyVerdict = (target, verdict) => {
  if (!verdict) return;
  if (typeof verdict.verified === "boolean") {
    target.verified = verdict.verified;
  }
  if (typeof verdict.rejectionReason === "string") {
    target.rejectionReason = verdict.rejectionReason;
  }
};

const applyDocumentVerdicts = (owner, body) => {
  for (const field of [
    "companyRegistration",
    "taxRegistration",
    "ownerIdentity",
  ]) {
    if (body[field]) {
      owner[field] = owner[field] || {};
      applyVerdict(owner[field], body[field]);
    }
  }
};

const invalidDocuments = (owner) => {
  const result = [];
  const append = (document, label) => {
    if (document && (document.verified === false || document.rejectionReason)) {
      result.push({
        label,
        reason: document.rejectionReason || null,
      });
    }
  };
  append(owner.companyRegistration, "Company Registration");
  append(owner.taxRegistration, "Tax Registration (PAN/VAT)");
  append(owner.ownerIdentity, "Owner Citizenship");
  return result;
};

module.exports = { applyDocumentVerdicts, invalidDocuments };
