"use strict";

const { resolveAuthorizedAdminActor } = require("./admin-actor.resolver");
const { buildAdminOwnerProfileAuditEvent } = require("./admin-owner-profile-audit.builder");
const { calculateProfileChanges } = require("./admin-owner-profile-changes.calculator");
const { validateAdminOwnerProfileRequest } = require("./admin-owner-profile-request.policy");
const { formatAdminOwnerProfileResponse } = require("./admin-owner-profile.dto");

const { KYC_SIGNIFICANT_FIELDS } = require("./admin-owner-profile.constants");
const { AdminOwnerProfileError } = require("./admin-owner-profile.errors");

async function restoreUserWithoutMasking({ repository, user, updatedUser, userSnapshot, logger }) {
  try {
    const restored = await repository.restoreUserSnapshot({
      userId: user._id,
      expectedCurrentVersion: updatedUser.__v,
      snapshot: userSnapshot,
    });

    if (!restored) {
      logger.error(
        "User profile rollback skipped because the guarded version no longer matched.",
        { userId: String(user._id), expectedVersion: updatedUser.__v }
      );
    }
  } catch (rollbackError) {
    logger.error("User profile rollback failed:", rollbackError);
  }
}

function createAdminOwnerProfileService(deps = {}) {
  const repository = deps.repository;
  const resolveActor = deps.resolveAuthorizedAdminActor || resolveAuthorizedAdminActor;
  const buildAudit = deps.buildAdminOwnerProfileAuditEvent || buildAdminOwnerProfileAuditEvent;
  const validateRequest = deps.validateAdminOwnerProfileRequest || validateAdminOwnerProfileRequest;
  const formatResponse = deps.formatAdminOwnerProfileResponse || formatAdminOwnerProfileResponse;
  const calcChanges = deps.calculateProfileChanges || calculateProfileChanges;
  const clock = deps.clock || (() => new Date());
  const logger = deps.logger || console;

  async function updateAdminOwnerProfile(input = {}) {
    const { actor, ...body } = input;
    const validated = validateRequest(body);
    const { id, changeReason, updates } = validated;

    const admin = await resolveActor(actor, deps);
    const owner = await repository.findOwnerForProfileUpdate(id);
    if (!owner) {
      throw new AdminOwnerProfileError("BUS_OWNER_NOT_FOUND", "Bus Owner record not found.", 404);
    }

    const user = await repository.findLinkedUserForProfileUpdate(owner.user);
    if (!user) {
      throw new AdminOwnerProfileError("LINKED_USER_NOT_FOUND", "Linked user account not found.", 404);
    }

    const { userSet, userSnapshot, ownerSet, changedFields } = calcChanges({ user, owner, updates });

    if (changedFields.length === 0) {
      throw new AdminOwnerProfileError("OWNER_PROFILE_NO_CHANGES", "No changes detected.", 400);
    }

    if (owner.verificationStatus === "approved") {
      const forbiddenChanged = changedFields.filter((f) => KYC_SIGNIFICANT_FIELDS.includes(f));
      if (forbiddenChanged.length > 0) {
        throw new AdminOwnerProfileError(
          "APPROVED_KYC_FACT_IMMUTABLE",
          "Approved KYC facts cannot be changed through profile update.",
          409,
          { fields: forbiddenChanged }
        );
      }
    }

    if (userSet.email !== undefined || userSet.phone !== undefined) {
      const conflict = await repository.findUserConflict({
        currentUserId: user._id,
        email: userSet.email,
        phone: userSet.phone,
      });

      if (conflict === "email") {
        throw new AdminOwnerProfileError("OWNER_PROFILE_EMAIL_CONFLICT", "Email address is already in use by another user.", 409, { field: "email" });
      }
      if (conflict === "phone") {
        throw new AdminOwnerProfileError("OWNER_PROFILE_PHONE_CONFLICT", "Phone number is already in use by another user.", 409, { field: "phone" });
      }
    }

    const decidedAt = clock();
    const auditEvent = buildAudit({
      actorId: admin._id,
      occurredAt: decidedAt,
      reason: changeReason,
      ownerVerificationStatus: owner.verificationStatus,
      changedFields,
    });

    let userWasUpdated = false;
    let updatedUser = null;

    if (Object.keys(userSet).length > 0) {
      updatedUser = await repository.updateUserWithVersion({ userId: user._id, expectedVersion: user.__v, set: userSet });
      if (!updatedUser) {
        throw new AdminOwnerProfileError("OWNER_PROFILE_CONCURRENT_MODIFICATION", "User profile was concurrently modified.", 409);
      }
      userWasUpdated = true;
    }

    let ownerUpdateError = null;
    let updatedOwner = null;

    try {
      updatedOwner = await repository.updateOwnerWithVersion({ ownerId: owner._id, expectedVersion: owner.__v, set: ownerSet, auditEvent });
    } catch (err) {
      ownerUpdateError = err;
    }

    if (!updatedOwner) {
      if (userWasUpdated) {
        await restoreUserWithoutMasking({ repository, user, updatedUser, userSnapshot, logger });
      }
      if (ownerUpdateError) throw ownerUpdateError;
      throw new AdminOwnerProfileError("OWNER_PROFILE_CONCURRENT_MODIFICATION", "Bus Owner profile was modified by another request.", 409);
    }

    return formatResponse({ ownerId: owner._id, userId: user._id, verificationStatus: owner.verificationStatus, changedFields, updatedAt: decidedAt });
  }

  return { updateAdminOwnerProfile };
}

module.exports = { createAdminOwnerProfileService, restoreUserWithoutMasking };
