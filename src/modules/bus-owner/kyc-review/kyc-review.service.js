"use strict";

const { KycReviewError } = require("./kyc-review.errors");
const { assertKycReviewTransition } = require("./kyc-review.policy");
const { validateKycReviewRequest } = require("./kyc-review-request.policy");
const { resolveBusOwnerForReviewReference } = require("./kyc-review-reference.resolver");
const { getKycReviewerActor, assertCanReviewBusOwnerKyc } = require("./kyc-review-actor.policy");
const { resolveKycReviewer } = require("./kyc-review-reviewer.resolver");
const { assertReviewerIsIndependent } = require("./kyc-review-separation-of-duty.policy");
const { isKycMalwareScanReady } = require("../kyc-document-read/kyc-document-reference.service");
const { createDefaultBrandService } = require("./kyc-default-brand.service");
const { assertApprovalRequirements } = require("./kyc-review-approval.policy");
const { buildReviewPersistence } = require("./kyc-review-update.builder");
const { executeKycReview, runKycReviewTransaction } = require("./kyc-review-transaction.service");

function normalizeActorInput(input) {
  if (input?.adminId?.trim?.() && input?.tokenRole?.trim?.()) return { adminId: input.adminId.trim(), tokenRole: input.tokenRole.trim() };
  if (input?.adminInfo) return getKycReviewerActor(input);
  throw new KycReviewError("KYC_REVIEW_UNAUTHORIZED", "Authenticated reviewer identity is required.", 401);
}

async function loadBusOwnerUser({ User, owner }) {
  if (!User?.findById || !owner.user) return null;
  const query = User.findById(owner.user);
  return query?.lean ? query.lean() : query;
}

function createKycReviewService({ Admin, BusOwner, User, OperatorBrand, defaultBrandService: customDefaultBrandService, applyDocumentVerdicts, invalidDocuments, mongoose: customMongoose, clock = () => new Date(), logger = console, environment = process.env.NODE_ENV }) {
  const mongoose = customMongoose || require("mongoose");
  const defaultBrandService = customDefaultBrandService || createDefaultBrandService({ OperatorBrand, clock, logger });
  async function reviewKyc(body, actorInput) {
    const actor = normalizeActorInput(actorInput);
    const { id, targetStatus, rejectionReason } = validateKycReviewRequest(body);
    const reviewer = await resolveKycReviewer({ Admin, actor });
    assertCanReviewBusOwnerKyc({ reviewer, tokenRole: actor.tokenRole });
    const owner = await resolveBusOwnerForReviewReference({ id, BusOwner });
    if (!isKycMalwareScanReady(owner, environment)) throw new KycReviewError("KYC_REVIEW_SECURITY_SCAN_REQUIRED", "KYC documents are quarantined until their security scan is complete.", 423);
    const busOwnerUser = await loadBusOwnerUser({ User, owner });
    assertReviewerIsIndependent({ reviewer, busOwner: owner, busOwnerUser });
    assertKycReviewTransition({ currentStatus: owner.verificationStatus, targetStatus });
    if (typeof applyDocumentVerdicts === "function") applyDocumentVerdicts(owner, body);
    const companyName = assertApprovalRequirements(owner, targetStatus);
    const reviewedAt = clock();
    const persistence = buildReviewPersistence({ owner, reviewer, targetStatus, rejectionReason, reviewedAt });
    const result = await runKycReviewTransaction({
      mongoose, customMongoose,
      work: (session) => executeKycReview({ owner, reviewer, targetStatus, companyName, persistence, BusOwner, User, defaultBrandService, logger, session }),
    });
    const documents = typeof invalidDocuments === "function" ? invalidDocuments(result.updatedOwner) : [];
    return {
      owner: result.updatedOwner, user: result.syncedUser || busOwnerUser || { _id: result.updatedOwner.user }, status: targetStatus, documents, defaultBrand: result.defaultBrand,
      data: { busOwnerId: result.updatedOwner.busOwnerId || result.updatedOwner._id.toString(), verificationStatus: result.updatedOwner.verificationStatus, rejectionReason: result.updatedOwner.rejectionReason, kycReview: result.updatedOwner.kycReview, defaultBrandId: result.defaultBrand?._id || result.defaultBrand?.id || null },
    };
  }
  return { reviewKyc };
}

module.exports = { createKycReviewService };
