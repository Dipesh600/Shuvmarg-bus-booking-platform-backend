"use strict";

const BusOwner = require("../../../../models/busOwnerModel");
const { uploadFileToS3, deleteObjectFromS3, buildS3Path } = require("../../../../services/s3Service");
const { createKycDocumentStorageService } = require("../../bus-owner/kyc-submission/kyc-document-storage.service");
const { validateKycDocuments } = require("../../bus-owner/kyc-submission/kyc-document.validator");
const { buildKycAuditEvent } = require("../../bus-owner/kyc-audit");
const { resolveAuthorizedAdminActor } = require("./admin-actor.resolver");
const { normalizeAdminKycFiles } = require("./admin-kyc-document-mapping.policy");
const { ADMIN_CREATION_KYC_POLICY } = require("./admin-kyc-document.policy");
const { validateAdminOwnerCreationBody } = require("./admin-owner-creation-request.policy");
const {
  prepareOwnerIdentity,
  createUnnotifiedUser,
  addOwnerRoleToExistingUser,
  rollbackUserIdentity,
  notifyNewOwnerCredentials,
} = require("./admin-owner-identity.service");

function createAdminOwnerCreationService(deps = {}) {
  const BusOwnerModel = deps.BusOwner || BusOwner;
  const storageService = deps.storageService || createKycDocumentStorageService({ uploadFileToS3, deleteObjectFromS3, buildS3Path });
  const clock = deps.clock || (() => new Date());
  const resolveActor = deps.resolveAuthorizedAdminActor || resolveAuthorizedAdminActor;
  const prepareIdentity = deps.prepareOwnerIdentity || prepareOwnerIdentity;
  const createUser = deps.createUnnotifiedUser || createUnnotifiedUser;
  const addRole = deps.addOwnerRoleToExistingUser || addOwnerRoleToExistingUser;
  const rollbackUser = deps.rollbackUserIdentity || rollbackUserIdentity;
  const notifyUser = deps.notifyNewOwnerCredentials || notifyNewOwnerCredentials;

  async function createAdminBusOwner({ body, files, actor }) {
    const sanitizedBody = validateAdminOwnerCreationBody(body);
    const normalizedFiles = normalizeAdminKycFiles(files);
    const validatedFiles = validateKycDocuments(normalizedFiles, ADMIN_CREATION_KYC_POLICY);
    const admin = await resolveActor(actor, deps);

    const preparedIdentity = await prepareIdentity(sanitizedBody, deps);
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
        const fileItems = validatedFiles[docType];
        for (const item of fileItems) {
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
          documentUrls: fileKeysBySection.bankDetails || [],
        },
        verificationStatus: "pending",
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

      if (preparedIdentity.isNew) {
        await notifyUser({
          phone: sanitizedBody.phone,
          email: sanitizedBody.email,
          ownerName: sanitizedBody.ownerName,
          password: preparedIdentity.password,
        }, deps);
      }

      return {
        busOwnerId: busOwner.busOwnerId || busOwner._id.toString(),
        userId: commitResult.user._id,
      };
    } catch (err) {
      if (newlyUploadedKeys.length > 0) {
        await storageService.deleteMany(newlyUploadedKeys);
      }
      if (busOwner && busOwner._id) {
        await BusOwnerModel.findByIdAndDelete(busOwner._id).catch(() => {});
      }
      if (commitResult) {
        await rollbackUser(commitResult, deps);
      }
      throw err;
    }
  }

  return { createAdminBusOwner };
}

module.exports = { createAdminOwnerCreationService };
