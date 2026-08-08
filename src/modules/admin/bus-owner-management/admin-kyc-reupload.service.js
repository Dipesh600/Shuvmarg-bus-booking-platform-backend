"use strict";

const BusOwner = require("../../../../models/busOwnerModel");
const { uploadFileToS3, deleteObjectFromS3, buildS3Path } = require("../../../../services/s3Service");
const { createKycDocumentStorageService } = require("../../bus-owner/kyc-submission/kyc-document-storage.service");
const { validateSingleFile } = require("../../bus-owner/kyc-submission/kyc-document.validator");
const { buildKycAuditEvent } = require("../../bus-owner/kyc-audit");
const { resolveAuthorizedAdminActor } = require("./admin-actor.resolver");
const { ADMIN_REUPLOAD_ALLOWED_TYPES } = require("./admin-kyc-document.policy");

function createAdminKycReuploadService(deps = {}) {
  const BusOwnerModel = deps.BusOwner || BusOwner;
  const storageService = deps.storageService || createKycDocumentStorageService({ uploadFileToS3, deleteObjectFromS3, buildS3Path });
  const clock = deps.clock || (() => new Date());
  const resolveActor = deps.resolveAuthorizedAdminActor || resolveAuthorizedAdminActor;

  async function reuploadRejectedKycDocument({ ownerId, documentType, file, actor }) {
    if (!ownerId || !documentType) {
      const err = new Error("Bus Owner ID and Document Type are required.");
      err.statusCode = 400;
      err.code = "KYC_REUPLOAD_OWNER_ID_REQUIRED";
      throw err;
    }

    if (!ADMIN_REUPLOAD_ALLOWED_TYPES.includes(documentType)) {
      const err = new Error("Invalid document type.");
      err.statusCode = 400;
      err.code = "KYC_REUPLOAD_INVALID_DOCUMENT_TYPE";
      throw err;
    }

    if (!file) {
      const err = new Error("No document file provided for re-upload.");
      err.statusCode = 400;
      err.code = "KYC_REUPLOAD_FILE_REQUIRED";
      throw err;
    }

    const validatedFile = validateSingleFile(file, documentType);
    const admin = await resolveActor(actor, deps);

    const owner = await BusOwnerModel.findById(ownerId);
    if (!owner) {
      const err = new Error("Bus owner KYC record not found.");
      err.statusCode = 404;
      err.code = "KYC_REUPLOAD_OWNER_NOT_FOUND";
      throw err;
    }

    if (owner.verificationStatus !== "rejected") {
      const err = new Error("Document re-upload is allowed only when KYC status is rejected.");
      err.statusCode = 409;
      err.code = "KYC_REUPLOAD_INVALID_STATE";
      throw err;
    }

    const oldObjectKey = owner[documentType] && Array.isArray(owner[documentType].documentUrls) ? owner[documentType].documentUrls[0] : null;
    const now = clock();
    let newObjectKey = null;

    try {
      newObjectKey = await storageService.uploadDocument({ validatedFile, ownerId: owner._id, documentType });
    } catch (uploadErr) {
      throw uploadErr;
    }

    let updated;
    try {
      const auditEvent = buildKycAuditEvent({
        eventType: "KYC_RESUBMITTED",
        actorType: "ADMIN",
        actorId: admin._id,
        fromStatus: "rejected",
        toStatus: "pending",
        occurredAt: now,
        metadata: { documentCount: 1 },
      });

      updated = await BusOwnerModel.findOneAndUpdate(
        { _id: owner._id, verificationStatus: "rejected" },
        {
          $set: {
            verificationStatus: "pending",
            rejectionReason: null,
            "kycReview.reviewedBy": null,
            "kycReview.reviewedAt": null,
            [`${documentType}.documentUrls`]: [newObjectKey],
            [`${documentType}.verified`]: false,
            [`${documentType}.rejectionReason`]: null,
          },
          $push: { kycAuditHistory: auditEvent },
        },
        { new: true, runValidators: true }
      );
    } catch (dbErr) {
      if (newObjectKey) {
        await storageService.deleteMany([newObjectKey]).catch(() => {});
      }
      throw dbErr;
    }

    if (!updated) {
      if (newObjectKey) await storageService.deleteMany([newObjectKey]).catch(() => {});
      const err = new Error("Concurrent modification detected. KYC status is no longer rejected.");
      err.statusCode = 409;
      err.code = "KYC_REUPLOAD_CONFLICT";
      throw err;
    }

    if (oldObjectKey) {
      await storageService.deleteMany([oldObjectKey]).catch(() => {});
    }

    return {
      busOwnerId: updated.busOwnerId || updated._id.toString(),
      verificationStatus: "pending",
      documentType,
    };
  }

  return { reuploadRejectedKycDocument };
}

module.exports = { createAdminKycReuploadService };
