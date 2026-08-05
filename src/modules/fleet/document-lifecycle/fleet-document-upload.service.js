const crypto = require("node:crypto");
const requestPolicy = require("./fleet-document-request.policy");
const filePolicy = require("./fleet-document-file.policy");
const approvalPolicy = require("./fleet-document-approval.policy");
const auditBuilder = require("./fleet-document-audit.builder");
const dto = require("./fleet-document.dto");
const errors = require("./fleet-document.errors");

function createFleetDocumentUploadService(deps = {}) {
  const repository = deps.repository;
  const storage = deps.storage;
  const resolveActor = deps.resolveActor;
  const logger = deps.logger || console;
  const clock = deps.clock || (() => new Date());

  async function uploadDocument({ fleetId, slot, body, files, actorContext }) {
    requestPolicy.validateFleetId(fleetId);
    requestPolicy.validateSlot(slot);
    requestPolicy.rejectPrivilegedAndUnknownFields(body, slot);

    const actor = await resolveActor(actorContext, repository);
    const fleet = await repository.findFleetForDocumentUpdate({ fleetId, slot });
    if (!fleet) throw errors.notFound();

    if (actor.actorType === "BUS_OWNER") {
      if (fleet.ownerId.toString() !== actor.userId) {
        throw errors.forbidden("Fleet does not belong to the authenticated owner.");
      }
    }

    approvalPolicy.enforceUploadPolicy(fleet, slot);

    const action = approvalPolicy.classifyAction(fleet, slot);
    const isReasonRequired = action === "REPLACED" || action === "RESUBMITTED";
    const changeReason = requestPolicy.validateChangeReason(body?.changeReason, isReasonRequired);
    const metadata = requestPolicy.validateSlotMetadata(slot, body || {});

    const fileList = requestPolicy.validateFilesPayload(slot, files);
    const validatedFiles = filePolicy.validateFileCollection(fileList, slot);

    const newAssets = [];
    const uploadedKeys = [];

    try {
      for (let i = 0; i < fileList.length; i++) {
        const fileObj = fileList[i];
        const valInfo = validatedFiles[i];
        const key = storage.buildPrivateObjectKey(fleetId, slot, valInfo.extension);
        await storage.uploadPrivate({ file: fileObj, objectKey: key });
        uploadedKeys.push(key);

        newAssets.push({
          imageId: crypto.randomUUID(),
          objectKey: key,
          mimeType: valInfo.mimeType,
          size: valInfo.size,
        });
      }
    } catch (err) {
      if (uploadedKeys.length > 0) {
        await storage.deleteNewObjectOrReport(uploadedKeys, logger);
      }
      throw err;
    }

    const now = clock();
    const previousFleetStatus = fleet.approvalStatus;
    const resultingFleetStatus = fleet.approvalStatus === "REJECTED" ? "PENDING" : fleet.approvalStatus;

    const auditEvent = auditBuilder.buildDocumentAuditEvent({
      action,
      actor,
      slot,
      previousFleetApprovalStatus: previousFleetStatus,
      resultingFleetApprovalStatus: resultingFleetStatus,
      reason: changeReason,
      now,
    });

    const updateQuery = approvalPolicy.buildUpdateQuery({
      fleet,
      slot,
      actor,
      metadata,
      newAssets,
      auditEvent,
    });

    let updatedFleet;
    try {
      updatedFleet = await repository.atomicDocumentUpdate({
        fleetId,
        expectedVersion: fleet.__v,
        update: updateQuery,
      });
    } catch (databaseError) {
      if (uploadedKeys.length > 0) {
        await storage.deleteNewObjectOrReport(uploadedKeys, logger);
      }
      throw databaseError;
    }

    if (!updatedFleet) {
      if (uploadedKeys.length > 0) {
        await storage.deleteNewObjectOrReport(uploadedKeys, logger);
      }
      throw errors.concurrentModification();
    }

    // Best effort old object cleanup
    const oldKeys = [];
    if (slot === "fleetImages" && Array.isArray(fleet.fleetImages)) {
      for (const img of fleet.fleetImages) {
        if (img?.objectKey) oldKeys.push(img.objectKey);
      }
    } else {
      const doc = fleet.fleetDocuments?.[slot];
      if (doc?.objectKey) oldKeys.push(doc.objectKey);
    }
    if (oldKeys.length > 0) {
      storage.deleteOldObjectBestEffort(oldKeys, logger);
    }

    const docStatus = updatedFleet.documentReviews?.[slot]?.status || "pending";

    return dto.buildUploadResponse({
      fleetId,
      slot,
      action,
      documentStatus: docStatus,
      fleetApprovalStatus: updatedFleet.approvalStatus,
      operationalStatus: updatedFleet.status,
      uploadedAt: now,
    });
  }

  return { uploadDocument };
}

module.exports = createFleetDocumentUploadService;
