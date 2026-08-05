"use strict";

const { toIsoDate } = require("./read-date.mapper");

const KYC_DOCUMENT_SLOTS = Object.freeze([
  "companyRegistration",
  "ownerIdentity",
  "taxRegistration",
  "transportLicense",
  "insuranceCertificates",
  "bankDetails",
]);

function hasDocumentUrls(doc) {
  if (!doc) return false;
  if (Array.isArray(doc.documentUrls)) return doc.documentUrls.length > 0;
  if (typeof doc.url === "string") return Boolean(doc.url);
  return false;
}

function mapSingularKycDescriptor(owner, slot) {
  const doc = owner?.[slot];
  const present = hasDocumentUrls(doc);
  const verified = Boolean(doc?.verified);
  const rejectionReason = doc?.rejectionReason || null;
  const fileCount = Array.isArray(doc?.documentUrls) ? doc.documentUrls.length : (present ? 1 : 0);

  const result = {
    slot,
    present,
    available: present,
    fileCount,
    verified,
    rejectionReason,
  };

  if (slot === "taxRegistration") {
    result.panNumber = doc?.panNumber || null;
    result.vatNumber = doc?.vatNumber || null;
    result.registrationNumber = doc?.registrationNumber || null;
  } else if (slot === "transportLicense") {
    result.licenseNumber = doc?.licenseNumber || null;
    result.validTill = toIsoDate(doc?.validTill);
  }

  return result;
}

function mapInsuranceCertificatesDescriptor(owner) {
  const list = Array.isArray(owner?.insuranceCertificates)
    ? owner.insuranceCertificates
    : [];

  const items = list.map((cert, index) => {
    const present = hasDocumentUrls(cert);
    const fileCount = Array.isArray(cert?.documentUrls) ? cert.documentUrls.length : (present ? 1 : 0);
    return {
      index,
      present,
      available: present,
      fileCount,
      verified: Boolean(cert?.verified),
      rejectionReason: cert?.rejectionReason || null,
      insurerName: cert?.insurerName || null,
      policyNumber: cert?.policyNumber || null,
      validTill: toIsoDate(cert?.validTill),
    };
  });

  const present = items.some((i) => i.present);
  const totalFileCount = items.reduce((acc, curr) => acc + curr.fileCount, 0);

  return {
    slot: "insuranceCertificates",
    present,
    available: present,
    fileCount: totalFileCount,
    count: items.length,
    items,
  };
}

function mapBankDetailsDescriptor(owner) {
  const bank = owner?.bankDetails;
  const present = hasDocumentUrls(bank) || Boolean(bank?.accountNumber);
  const fileCount = Array.isArray(bank?.documentUrls) ? bank.documentUrls.length : (present ? 1 : 0);

  return {
    slot: "bankDetails",
    present,
    available: present,
    fileCount,
    bankName: bank?.bankName || null,
    accountNumber: bank?.accountNumber || null,
    accountHolderName: bank?.accountHolderName || null,
    branchName: bank?.branchName || null,
    swiftCode: bank?.swiftCode || null,
  };
}

function mapKycDocumentDescriptors(owner) {
  return {
    companyRegistration: mapSingularKycDescriptor(owner, "companyRegistration"),
    ownerIdentity: mapSingularKycDescriptor(owner, "ownerIdentity"),
    taxRegistration: mapSingularKycDescriptor(owner, "taxRegistration"),
    transportLicense: mapSingularKycDescriptor(owner, "transportLicense"),
    insuranceCertificates: mapInsuranceCertificatesDescriptor(owner),
    bankDetails: mapBankDetailsDescriptor(owner),
  };
}

function calculateKycDocumentSummary(descriptors) {
  let present = 0;
  let missing = 0;
  let verified = 0;
  let unverified = 0;
  let rejected = 0;

  for (const slot of KYC_DOCUMENT_SLOTS) {
    const desc = descriptors[slot];
    if (desc.present) {
      present += 1;
      if (slot === "insuranceCertificates") {
        const allVerified = desc.items.length > 0 && desc.items.every((i) => i.verified);
        const hasRejection = desc.items.some((i) => Boolean(i.rejectionReason));
        if (allVerified) verified += 1;
        else if (hasRejection) {
          rejected += 1;
          unverified += 1;
        } else unverified += 1;
      } else {
        if (desc.verified) verified += 1;
        else {
          unverified += 1;
          if (desc.rejectionReason) rejected += 1;
        }
      }
    } else {
      missing += 1;
    }
  }

  return {
    totalSlots: KYC_DOCUMENT_SLOTS.length,
    present,
    missing,
    verified,
    unverified,
    rejected,
  };
}

module.exports = {
  KYC_DOCUMENT_SLOTS,
  mapKycDocumentDescriptors,
  calculateKycDocumentSummary,
};
