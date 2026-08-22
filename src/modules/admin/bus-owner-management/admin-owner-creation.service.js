"use strict";

const BusOwner = require("../../../../models/busOwnerModel");
const { uploadFileToS3, deleteObjectFromS3, buildS3Path } = require("../../../../services/s3Service");
const { createKycDocumentStorageService } = require("../../bus-owner/kyc-submission/kyc-document-storage.service");
const { validateKycDocuments } = require("../../bus-owner/kyc-submission/kyc-document.validator");
const { createKycMalwareScanner } = require("../../bus-owner/kyc-submission/kyc-malware-scanner.service");
const { buildKycAuditEvent } = require("../../bus-owner/kyc-audit");
const { resolveAuthorizedAdminActor } = require("./admin-actor.resolver");
const { normalizeAdminKycFiles } = require("./admin-kyc-document-mapping.policy");
const { ADMIN_CREATION_KYC_POLICY } = require("./admin-kyc-document.policy");
const { validateAdminOwnerCreationBody } = require("./admin-owner-creation-request.policy");
const { runCreationRollback } = require("./admin-owner-creation-rollback.helper");
const {
  prepareOwnerIdentity, createUnnotifiedUser, addOwnerRoleToExistingUser,
  rollbackUserIdentity,
} = require("./admin-owner-identity.service");
const { dispatchOwnerAccessNotification } = require("./admin-owner-access-notification.service");

function createAdminOwnerCreationService(deps = {}) {
  const BusOwnerModel = deps.BusOwner || BusOwner;
  const storageService = deps.storageService || createKycDocumentStorageService({ uploadFileToS3, deleteObjectFromS3, buildS3Path });
  const clock = deps.clock || (() => new Date());
  const resolveActor = deps.resolveAuthorizedAdminActor || resolveAuthorizedAdminActor;
  const prepareIdentity = deps.prepareOwnerIdentity || prepareOwnerIdentity;
  const createUser = deps.createUnnotifiedUser || createUnnotifiedUser;
  const addRole = deps.addOwnerRoleToExistingUser || addOwnerRoleToExistingUser;
  const rollbackUser = deps.rollbackUserIdentity || rollbackUserIdentity;
  const malwareScanner = deps.malwareScanner || createKycMalwareScanner({ clock, logger: deps.logger || console });

  async function createAdminBusOwner({ body, files, actor }) {
    const sanitizedBody = validateAdminOwnerCreationBody(body);
    const normalizedFiles = normalizeAdminKycFiles(files);
    const validatedFiles = validateKycDocuments(normalizedFiles, ADMIN_CREATION_KYC_POLICY);
    const admin = await resolveActor(actor, deps);
    const malwareScan = await malwareScanner.scanValidatedFiles(validatedFiles);

    const preparedIdentity = await prepareIdentity(sanitizedBody, {
      ...deps, issuedBy: admin._id, clock,
    });
    let commitResult = null;
    let busOwner = null;
    const newlyUploadedKeys = [];

    try {
      if (preparedIdentity.isNew) {
        commitResult = await createUser(preparedIdentity, deps);
      } else {
        commitResult = { user: preparedIdentity.existingUser, wasCreated: false, roleWasAdded: false };
      }

      const ownerId = new (deps.mongooseTypesObjectId || require("mongoose").Types.ObjectId)();
      const now = clock();

      for (const docType of Object.keys(validatedFiles)) {
        for (const item of validatedFiles[docType]) {
          const key = await storageService.uploadDocument({ validatedFile: item, ownerId, documentType: docType });
          newlyUploadedKeys.push(key);
        }
      }

      const fileKeysBySection = {};
      let keyIdx = 0;
      for (const docType of Object.keys(validatedFiles)) {
        const count = validatedFiles[docType].length;
        fileKeysBySection[docType] = newlyUploadedKeys.slice(keyIdx, keyIdx + count);
        keyIdx += count;
      }

      busOwner = new BusOwnerModel({
        _id: ownerId,
        user: commitResult.user._id,
        companyName: sanitizedBody.companyName,
        companyRegistration: { documentUrls: fileKeysBySection.companyRegistration || [], verified: false },
        ownerIdentity: { documentUrls: fileKeysBySection.ownerIdentity || [], verified: false },
        taxRegistration: {
          panNumber: sanitizedBody.panNumber || null,
          registrationNumber: sanitizedBody.registrationNumber || null,
          documentUrls: fileKeysBySection.taxRegistration || [],
          verified: false,
        },
        bankDetails: {
          bankName: sanitizedBody.bankName,
          accountNumber: sanitizedBody.accountNumber,
          accountHolderName: sanitizedBody.accountHolderName,
          branchName: sanitizedBody.branchName,
          swiftCode: sanitizedBody.swiftCode || null,
        },
        verificationStatus: "pending",
        kycSecurity: {
          malwareScanStatus: malwareScan.status,
          engine: malwareScan.engine,
          scannedAt: malwareScan.scannedAt,
          fileCount: malwareScan.fileCount,
          contentHashes: malwareScan.contentHashes,
        },
      });

      const auditEvent = buildKycAuditEvent({
        eventType: "KYC_SUBMITTED",
        actorType: "ADMIN",
        actorId: admin._id,
        fromStatus: null,
        toStatus: "pending",
        occurredAt: now,
        metadata: { documentCount: newlyUploadedKeys.length },
      });
      busOwner.kycAuditHistory = [auditEvent];

      await busOwner.save();

      if (!preparedIdentity.isNew) {
        commitResult = await addRole(preparedIdentity.existingUser, deps);
      }
    } catch (originalError) {
      await runCreationRollback({
        storageService,
        uploadedKeys: newlyUploadedKeys,
        BusOwnerModel,
        busOwner,
        rollbackUser,
        commitResult,
        deps,
        logger: deps.logger,
      });
      throw originalError;
    }

    const notification = await dispatchOwnerAccessNotification({
      isNew: preparedIdentity.isNew,
      user: commitResult.user,
      body: sanitizedBody,
      password: preparedIdentity.password,
      expiresAt: preparedIdentity.expiresAt,
    }, deps);

    return {
      busOwnerId: busOwner.busOwnerId || busOwner._id.toString(),
      userId: commitResult.user._id,
      credentialMode: preparedIdentity.isNew ? "TEMPORARY_PASSWORD" : "EXISTING_PASSWORD",
      notification,
    };
  }

  return { createAdminBusOwner };
}

module.exports = { createAdminOwnerCreationService, runCreationRollback };
