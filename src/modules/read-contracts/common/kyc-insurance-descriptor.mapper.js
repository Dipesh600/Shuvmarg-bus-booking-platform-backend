"use strict";

const { toIsoDate } = require("./read-date.mapper");
const { hasDocumentUrls } = require("./kyc-document-presence.mapper");

function mapInsuranceCertificatesDescriptor(owner) {
  const list = Array.isArray(owner?.insuranceCertificates)
    ? owner.insuranceCertificates
    : [];

  const items = list.map((cert, index) => {
    const present = hasDocumentUrls(cert);
    const fileCount = Array.isArray(cert?.documentUrls)
      ? cert.documentUrls.length
      : (present ? 1 : 0);
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
  const fileCount = Array.isArray(bank?.documentUrls)
    ? bank.documentUrls.length
    : (present ? 1 : 0);

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

module.exports = {
  mapInsuranceCertificatesDescriptor,
  mapBankDetailsDescriptor,
};
