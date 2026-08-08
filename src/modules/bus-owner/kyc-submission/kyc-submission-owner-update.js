"use strict";

const { buildKycAuditEvent, countValidatedKycFiles, KYC_AUDIT_EVENT, KYC_AUDIT_ACTOR } = require("../kyc-audit");

function applyKycSubmissionToOwner({
  busOwner, normalized, malwareScan, normalizedFiles, isInitialSubmission, userId, clock,
}) {
  busOwner.companyName = normalized.companyName;
  busOwner.registeredAddress = normalized.registeredAddress;
  busOwner.taxRegistration = busOwner.taxRegistration || {};
  busOwner.taxRegistration.panNumber = normalized.panNumber;
  busOwner.taxRegistration.registrationNumber = normalized.registrationNumber;
  busOwner.bankDetails = busOwner.bankDetails || {};
  Object.assign(busOwner.bankDetails, {
    bankName: normalized.bankName,
    accountHolderName: normalized.accountHolderName,
    accountNumber: normalized.accountNumber,
    branchName: normalized.branchName,
    swiftCode: normalized.swiftCode,
  });
  busOwner.verificationStatus = "pending";
  busOwner.rejectionReason = null;
  busOwner.kycReview = { reviewedBy: null, reviewedAt: null };
  busOwner.kycSecurity = {
    malwareScanStatus: malwareScan.status,
    engine: malwareScan.engine,
    scannedAt: malwareScan.scannedAt,
    fileCount: malwareScan.fileCount,
    contentHashes: malwareScan.contentHashes,
  };
  if (!Array.isArray(busOwner.kycAuditHistory)) busOwner.kycAuditHistory = [];
  busOwner.kycAuditHistory.push(buildKycAuditEvent({
    eventType: isInitialSubmission ? KYC_AUDIT_EVENT.SUBMITTED : KYC_AUDIT_EVENT.RESUBMITTED,
    actorType: KYC_AUDIT_ACTOR.BUS_OWNER,
    actorId: userId,
    fromStatus: isInitialSubmission ? null : "rejected",
    toStatus: "pending",
    occurredAt: clock(),
    metadata: {
      documentCount: countValidatedKycFiles(normalizedFiles),
      malwareScanStatus: malwareScan.status,
      malwareScanEngine: malwareScan.engine,
    },
  }));
}

module.exports = { applyKycSubmissionToOwner };
