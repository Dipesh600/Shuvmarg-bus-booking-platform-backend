"use strict";

const { KycReviewError } = require("./kyc-review.errors");
const { KYC_REVIEW_STATUS, assertKycReviewTransition } = require("./kyc-review.policy");
const { validateKycReviewRequest } = require("./kyc-review-request.policy");
const { resolveBusOwnerForReviewReference } = require("./kyc-review-reference.resolver");
const { syncReviewedOwnerUser } = require("./kyc-review-user-sync.service");
const { getKycReviewerActor, assertCanReviewBusOwnerKyc } = require("./kyc-review-actor.policy");
const { resolveKycReviewer } = require("./kyc-review-reviewer.resolver");
const { assertReviewerIsIndependent } = require("./kyc-review-separation-of-duty.policy");
const { buildKycAuditEvent, collectInvalidKycDocumentTypes, KYC_AUDIT_EVENT, KYC_AUDIT_ACTOR } = require("../kyc-audit");
const { isKycMalwareScanReady } = require("../kyc-document-read/kyc-document-reference.service");
const { REQUIRED_DOCUMENT_FIELDS, hasStoredDocument } = require("../kyc-submission/kyc-submission-state");
const { createDefaultBrandService } = require("./kyc-default-brand.service");

function normalizeActorInput(actorInput) {
  if (actorInput && typeof actorInput === "object" && typeof actorInput.adminId === "string" && actorInput.adminId.trim() && typeof actorInput.tokenRole === "string" && actorInput.tokenRole.trim()) {
    return { adminId: actorInput.adminId.trim(), tokenRole: actorInput.tokenRole.trim() };
  }
  if (actorInput && typeof actorInput === "object" && actorInput.adminInfo) {
    return getKycReviewerActor(actorInput);
  }
  throw new KycReviewError("KYC_REVIEW_UNAUTHORIZED", "Authenticated reviewer identity is required.", 401);
}

function createKycReviewService({
  Admin,
  BusOwner,
  User,
  OperatorBrand,
  defaultBrandService: customDefaultBrandService,
  applyDocumentVerdicts,
  invalidDocuments,
  mongoose: customMongoose,
  clock = () => new Date(),
  logger = console,
  environment = process.env.NODE_ENV,
}) {
  const mongoose = customMongoose || require("mongoose");
  const defaultBrandService = customDefaultBrandService || createDefaultBrandService({ OperatorBrand, clock, logger });

  async function reviewKyc(body, actorInput) {
    const actor = normalizeActorInput(actorInput);
    const { id, targetStatus, rejectionReason } = validateKycReviewRequest(body);

    const reviewer = await resolveKycReviewer({ Admin, actor });
    assertCanReviewBusOwnerKyc({ reviewer, tokenRole: actor.tokenRole });

    const owner = await resolveBusOwnerForReviewReference({ id, BusOwner });
    if (!isKycMalwareScanReady(owner, environment)) {
      throw new KycReviewError(
        "KYC_REVIEW_SECURITY_SCAN_REQUIRED",
        "KYC documents are quarantined until their security scan is complete.",
        423
      );
    }

    let busOwnerUser = null;
    if (User && typeof User.findById === "function" && owner.user) {
      const q = User.findById(owner.user);
      busOwnerUser = q && typeof q.lean === "function" ? await q.lean() : await q;
    }

    assertReviewerIsIndependent({ reviewer, busOwner: owner, busOwnerUser });
    assertKycReviewTransition({ currentStatus: owner.verificationStatus, targetStatus });

    if (typeof applyDocumentVerdicts === "function") {
      applyDocumentVerdicts(owner, body);
    }

    let companyName = "";
    if (targetStatus === KYC_REVIEW_STATUS.APPROVED) {
      companyName = (owner.companyName || "").trim();
      if (!companyName) {
        throw new KycReviewError(
          "KYC_REVIEW_MISSING_COMPANY_NAME",
          "Company name is required before approving bus owner KYC.",
          409
        );
      }
      const missingDocuments = REQUIRED_DOCUMENT_FIELDS.filter((field) => !hasStoredDocument(owner[field]));
      if (missingDocuments.length > 0) {
        throw new KycReviewError(
          "KYC_REVIEW_REQUIRED_DOCUMENTS_MISSING",
          "Company registration, PAN/VAT registration and owner citizenship are required before approval.",
          409
        );
      }
    }

    const reviewedAt = clock();
    const invalidDocumentTypes = targetStatus === KYC_REVIEW_STATUS.REJECTED ? collectInvalidKycDocumentTypes(owner) : [];

    const auditEvent = buildKycAuditEvent({
      eventType: targetStatus === KYC_REVIEW_STATUS.APPROVED ? KYC_AUDIT_EVENT.APPROVED : KYC_AUDIT_EVENT.REJECTED,
      actorType: KYC_AUDIT_ACTOR.ADMIN,
      actorId: reviewer._id,
      fromStatus: KYC_REVIEW_STATUS.PENDING,
      toStatus: targetStatus,
      occurredAt: reviewedAt,
      metadata: { invalidDocumentTypes, reasonProvided: targetStatus === KYC_REVIEW_STATUS.REJECTED },
    });

    const updateFields = {
      verificationStatus: targetStatus,
      rejectionReason: targetStatus === KYC_REVIEW_STATUS.REJECTED ? rejectionReason : null,
      "kycReview.reviewedBy": reviewer._id,
      "kycReview.reviewedAt": reviewedAt,
    };

    const docFields = ["companyRegistration", "ownerIdentity", "taxRegistration"];
    for (const field of docFields) {
      if (owner[field]) {
        updateFields[`${field}.verified`] = owner[field].verified;
        updateFields[`${field}.rejectionReason`] = owner[field].rejectionReason || null;
      }
    }

    let updatedOwner = null;
    let syncedUser = null;
    let defaultBrand = null;

    async function executeTransactionalReview(session) {
      if (targetStatus === KYC_REVIEW_STATUS.APPROVED) {
        try {
          const brandResult = await defaultBrandService.ensureDefaultBrand({
            ownerId: owner.user,
            companyName,
            adminId: reviewer._id,
            session,
          });
          defaultBrand = brandResult?.brand || null;
          logger.info(
            `[KycReview] Default brand ensured for owner ${owner.user} (brandId: ${defaultBrand?._id || defaultBrand?.id})`
          );
        } catch (brandErr) {
          if (brandErr && typeof brandErr.hasErrorLabel === "function" && brandErr.hasErrorLabel("TransientTransactionError")) {
            throw brandErr;
          }
          logger.error("KYC review default brand provisioning failed for owner:", owner.user, brandErr);
          throw new KycReviewError(
            "KYC_REVIEW_DEFAULT_BRAND_FAILED",
            "Failed to provision default operator brand upon KYC approval.",
            500
          );
        }
      }

      const updateOptions = { new: true, runValidators: true };
      if (session) updateOptions.session = session;

      updatedOwner = await BusOwner.findOneAndUpdate(
        { _id: owner._id, verificationStatus: KYC_REVIEW_STATUS.PENDING },
        { $set: updateFields, $push: { kycAuditHistory: auditEvent } },
        updateOptions
      );

      if (!updatedOwner) {
        throw new KycReviewError(
          "KYC_REVIEW_INVALID_TRANSITION",
          `Cannot transition KYC review status from '${owner.verificationStatus}' to '${targetStatus}'.`,
          409
        );
      }

      try {
        syncedUser = await syncReviewedOwnerUser({
          userId: updatedOwner.user,
          targetStatus,
          User,
          session,
          logger,
        });
      } catch (userSyncErr) {
        logger.error("KYC review user sync failed for owner:", updatedOwner._id, userSyncErr);
        throw new KycReviewError("KYC_REVIEW_USER_SYNC_FAILED", "Internal Server Error", 500);
      }
    }

    const hasSessionSupport = Boolean(
      (customMongoose && typeof customMongoose.startSession === "function") ||
      (mongoose && mongoose.connection && mongoose.connection.readyState === 1 && typeof mongoose.startSession === "function")
    );

    if (hasSessionSupport) {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          await executeTransactionalReview(session);
        });
      } finally {
        await session.endSession();
      }
    } else {
      await executeTransactionalReview(null);
    }

    const invalidDocs = typeof invalidDocuments === "function" ? invalidDocuments(updatedOwner) : [];

    return {
      owner: updatedOwner,
      user: syncedUser || busOwnerUser || { _id: updatedOwner.user },
      status: targetStatus,
      documents: invalidDocs,
      defaultBrand,
      data: {
        busOwnerId: updatedOwner.busOwnerId || updatedOwner._id.toString(),
        verificationStatus: updatedOwner.verificationStatus,
        rejectionReason: updatedOwner.rejectionReason,
        kycReview: updatedOwner.kycReview,
        defaultBrandId: defaultBrand?._id || defaultBrand?.id || null,
      },
    };
  }

  return { reviewKyc };
}

module.exports = { createKycReviewService };
